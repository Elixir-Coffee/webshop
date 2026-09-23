// The checkout address form.
//
// PR-Foundry fork addition. Replaces webshop's native "New Address" dialog with one form
// that captures everything a delivery actually needs: an international phone, an email, and
// (from Task 6) a Google-autocompleted address carrying coordinates -- because TCG publishes
// no geocoding endpoint, so an L2D booking's lat/lng has to come from us.
//
// THE SEAM. This takes over by rebinding `.btn-new-address`, NOT by editing
// templates/includes/cart/cart_address.html. webshop is an upstream fork here; a template we
// copy or patch diverges silently on the next sync, which is the lesson already recorded
// against the locker picker. A rebind keeps the fork-patch surface in upstream-owned files at
// zero lines.
//
// The price of that choice is a silent failure mode: if upstream renames the class, this binds
// to nothing and the native dialog quietly returns. That is why
// client_app.tests.test_checkout_address_seam exists and why it checks both that the class is
// present AND that upstream still binds a click to it.

frappe.provide("webshop.checkout_address");

webshop.checkout_address = {
	VENDOR: "/assets/webshop/vendor/intl-tel-input",
	_vendor: null,

	// -- lazy vendor loading ------------------------------------------------------------
	//
	// intl-tel-input's WithUtils build is 316 KB, taken deliberately because getNumber()
	// (E.164) and isValidNumber() both live in the utils half. It is fetched when a customer
	// opens this form and never on page load, so a visitor who never enters an address never
	// pays for it.

	loadStyle(href) {
		if (document.querySelector(`link[href="${href}"]`)) return;
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		document.head.appendChild(link);
	},

	loadScript(src) {
		return new Promise((resolve, reject) => {
			const existing = document.querySelector(`script[src="${src}"]`);
			if (existing) {
				if (existing.dataset.loaded) return resolve();
				existing.addEventListener("load", () => resolve());
				existing.addEventListener("error", reject);
				return;
			}
			const script = document.createElement("script");
			script.src = src;
			script.addEventListener("load", () => {
				script.dataset.loaded = "1";
				resolve();
			});
			script.addEventListener("error", reject);
			document.head.appendChild(script);
		});
	},

	async ensureVendor() {
		if (webshop.checkout_address._vendor) return webshop.checkout_address._vendor;
		const base = webshop.checkout_address.VENDOR;
		webshop.checkout_address.loadStyle(`${base}/css/intlTelInput.min.css`);
		webshop.checkout_address._vendor = webshop.checkout_address
			.loadScript(`${base}/js/intlTelInputWithUtils.min.js`)
			.catch((e) => {
				// Reset so a later attempt can retry rather than being stuck on a rejected
				// promise, and let the caller decide -- the form must still open.
				webshop.checkout_address._vendor = null;
				throw e;
			});
		return webshop.checkout_address._vendor;
	},

	// -- the seam ----------------------------------------------------------------------

	takeOver() {
		const $btn = $(`.${webshop.checkout_address.HOOK_CLASS}`);
		if (!$btn.length) return false;
		$btn.off("click").on("click", (e) => {
			e.preventDefault();
			webshop.checkout_address.open($(e.currentTarget));
		});
		return true;
	},

	HOOK_CLASS: "btn-new-address",

	// -- the form ----------------------------------------------------------------------

	// Which section the button sits in decides the address type, instead of asking the
	// customer to classify their own address. The native dialog made it a required choice.
	typeFor($btn) {
		const section = $btn.closest("[data-section]").attr("data-section") || "";
		return section.indexOf("billing") !== -1 ? "Billing" : "Shipping";
	},

	fields(addressType) {
		return [
			{
				fieldname: "wsa_lookup",
				fieldtype: "HTML",
				options: `<div class="wsa-lookup mb-3"></div>`,
			},
			{ label: __("Address Title"), fieldname: "address_title", fieldtype: "Data", reqd: 1 },
			{ label: __("Address Line 1"), fieldname: "address_line1", fieldtype: "Data", reqd: 1 },
			{ label: __("Address Line 2"), fieldname: "address_line2", fieldtype: "Data" },
			{ label: __("City/Town"), fieldname: "city", fieldtype: "Data", reqd: 1 },
			{ label: __("Province / State"), fieldname: "state", fieldtype: "Data" },
			{
				// Required here where upstream left it optional: the postal code is what
				// decides courier serviceability, so a blank one fails later and less
				// legibly than an empty box does now.
				label: __("Postal Code"),
				fieldname: "pincode",
				fieldtype: "Data",
				reqd: 1,
			},
			{
				label: __("Country"),
				fieldname: "country",
				fieldtype: "Link",
				options: "Country",
				only_select: true,
				reqd: 1,
			},
			{ fieldname: "col", fieldtype: "Column Break" },
			{
				fieldname: "wsa_phone",
				fieldtype: "HTML",
				options: `
					<div class="form-group">
						<label class="control-label" for="wsa-phone-input">${__("Mobile number")}</label>
						<input type="tel" id="wsa-phone-input" class="form-control wsa-phone-input"
							autocomplete="tel">
						<div class="small text-muted mt-1">${__(
							"Used for delivery notifications, including a locker collection PIN.",
						)}</div>
						<div class="small text-danger mt-1 wsa-phone-error" hidden></div>
					</div>`,
			},
			{
				label: __("Email"),
				fieldname: "email_id",
				fieldtype: "Data",
				options: "Email",
				reqd: 1,
				description: __("Delivery updates are sent here."),
			},
			{
				label: __("Address Type"),
				fieldname: "address_type",
				fieldtype: "Select",
				options: ["Billing", "Shipping"],
				default: addressType,
				reqd: 1,
			},
		];
	},

	async open($btn) {
		const addressType = webshop.checkout_address.typeFor($btn);

		// The vendor load is awaited but never allowed to stop the form opening: a phone
		// field without the flag widget is still a usable phone field, and a checkout that
		// cannot proceed because an asset failed is worse than a plainer input.
		let vendorOk = true;
		try {
			await webshop.checkout_address.ensureVendor();
		} catch (e) {
			vendorOk = false;
			console.warn("checkout address: phone widget unavailable, using a plain input", e);
		}

		const d = new frappe.ui.Dialog({
			title: __("Delivery Address"),
			fields: webshop.checkout_address.fields(addressType),
			primary_action_label: __("Save address"),
			primary_action: (values) => webshop.checkout_address.submit(d, values),
		});

		d.show();
		webshop.checkout_address._dialog = d;
		webshop.checkout_address._vendorOk = vendorOk;
		webshop.checkout_address.attachPhone(d, vendorOk);
		// Task 6 attaches the address lookup here.
		$(document).trigger("webshop:address-form-shown", [d, { vendorOk, addressType }]);
	},

	// -- phone ---------------------------------------------------------------------------

	attachPhone(d, vendorOk) {
		webshop.checkout_address._iti = null;
		const input = d.$wrapper.find(".wsa-phone-input")[0];
		if (!input) return;

		// No widget is a degraded form, not a broken one: the input stays a plain tel
		// field, whatever is typed goes to the server, and the server refuses anything
		// that is not E.164 with a message naming the format.
		if (!vendorOk || typeof window.intlTelInput !== "function") return;

		webshop.checkout_address._iti = window.intlTelInput(input, {
			// A default, not a restriction -- every country stays selectable. The shop is
			// South African, so that is where an unprompted customer most likely is.
			initialCountry: "za",
			countryOrder: ["za"],
			// Shows the dial code beside the flag rather than inside the input, so what the
			// customer types is their own number as they know it.
			separateDialCode: true,
			// Rejects characters and lengths that cannot belong to the chosen country while
			// typing, rather than only at submit.
			strictMode: true,
		});

		// Options verified present in the vendored 29.5.2 build. nationalMode,
		// preferredCountries and autoPlaceholder are NOT in this major and would be
		// silently ignored if passed.

		d.$wrapper.find(".wsa-phone-input").on("input", () => {
			d.$wrapper.find(".wsa-phone-error").attr("hidden", true);
		});

		d.$wrapper.on("hide.bs.modal", () => {
			const iti = webshop.checkout_address._iti;
			if (iti && typeof iti.destroy === "function") iti.destroy();
			webshop.checkout_address._iti = null;
		});
	},

	// What to send as `phone`, or an error to show. E.164 always: one canonical shape in
	// the database, carrier-specific formatting where a carrier is actually called.
	phoneValue(d) {
		const iti = webshop.checkout_address._iti;
		const $error = d.$wrapper.find(".wsa-phone-error");
		if (!iti) {
			return { number: (d.$wrapper.find(".wsa-phone-input").val() || "").trim() };
		}
		if (!iti.isValidNumber()) {
			$error.text(__("Enter a valid mobile number for the country shown.")).removeAttr("hidden");
			return { error: true };
		}
		$error.attr("hidden", true);
		return { number: iti.getNumber() };
	},

	submit(d, values) {
		// The phone is an HTML field, so frappe's `values` does not carry it.
		const phone = webshop.checkout_address.phoneValue(d);
		if (phone.error) return;
		values.phone = phone.number;

		d.get_primary_btn().prop("disabled", true);
		frappe
			.call("webshop.webshop.shopping_cart.cart.add_new_address", { doc: values })
			.then((r) =>
				frappe.call({
					method: "webshop.webshop.shopping_cart.cart.update_cart_address",
					args: {
						address_type: r.message.address_type,
						address_name: r.message.name,
					},
				}),
			)
			.then(() => {
				d.hide();
				// Reload, as the native dialog does: choosing an address changes the
				// totals, and webshop has no working client-side path to redraw the
				// Payment Summary (shopping_cart.render is called at cart.js:151 and
				// defined nowhere -- framework#223).
				window.location.reload();
			})
			.catch(() => d.get_primary_btn().prop("disabled", false));
	},
};

frappe.ready(() => {
	if (window.location.pathname.replace(/\/$/, "") !== "/cart") return;
	// setTimeout(0) so this runs after upstream's own frappe.ready handler has bound its
	// click. Registration order between apps is not something we control.
	setTimeout(() => webshop.checkout_address.takeOver(), 0);

	// And again whenever the cart re-renders. webshop replaces the address markup in place
	// after a quantity or address change, which destroys the element our click is bound to
	// -- the same re-render that made the locker picker need an observer. Without this the
	// button goes dead (or reverts to upstream's handler) the first time the customer edits
	// anything, which is indistinguishable from the rename failure the seam guard exists to
	// catch, and would be blamed on it.
	//
	// The handler only re-binds. It must never open the form: opening on a mutation would
	// fire on the re-render our own save triggers.
	const host = document.querySelector(".cart-payment-addresses") || document.body;
	new MutationObserver(
		frappe.utils.debounce(() => webshop.checkout_address.takeOver(), 250),
	).observe(host, { childList: true, subtree: true });
});
