from . import __version__ as _version

app_name = "webshop"
app_title = "Webshop"

# PR-Foundry/framework#165 (fork patch) — frappe v16 replaced the Desktop Icon grid
# with the `Apps` screen (`Desktop Settings.desktop_page`, default `Apps`), which is
# drawn ONLY from this hook. webshop declares none upstream, so its public `Webshop`
# workspace lost its only entry point: the Link-type Desktop Icon client_app seeds
# (framework bug-029/#038) still exists and is not hidden, but nothing renders it.
#
# It must live HERE, not in client_app: frappe/boot.py iterates
# `for app_name in frappe.get_active_apps()` and reads each app's OWN hook, so
# declaring it elsewhere would spend that app's tile slot on a tile labelled Webshop.
#
# `/desk/webshop` resolves because the public `Webshop` workspace supplies that slug;
# a `/desk/*` route without a matching workspace is a blank flicker with no Error Log
# row (framework#139 / bug-196). No `logo` key — webshop ships no brand asset, so boot
# falls back to the default rather than borrowing another app's mark.
# Upstream-owned line — re-verify after any webshop sync.
add_to_apps_screen = [
	{
		"name": "webshop",
		"title": app_title,
		"route": "/desk/webshop",
	}
]
app_publisher = "Frappe Technologies Pvt. Ltd."
app_description = "Open Source eCommerce Platform"
app_email = "contact@frappe.io"
app_license = "GNU General Public License (v3)"
app_version = _version

required_apps = ["payments", "erpnext"]

web_include_css = "webshop-web.bundle.css"

web_include_js = "web.bundle.js"

after_install = "webshop.setup.install.after_install"
on_logout = "webshop.webshop.shopping_cart.utils.clear_cart_count"
on_session_creation = [
    "webshop.webshop.utils.portal.update_debtors_account",
    "webshop.webshop.shopping_cart.utils.set_cart_count",
]
update_website_context = [
    "webshop.webshop.shopping_cart.utils.update_website_context",
]

website_generators = ["Website Item", "Item Group"]

override_doctype_class = {
    "Payment Request": "webshop.webshop.doctype.override_doctype.payment_request.PaymentRequest",
    "Item Group": "webshop.webshop.doctype.override_doctype.item_group.WebshopItemGroup",
    "Item": "webshop.webshop.doctype.override_doctype.item.WebshopItem",
}

doctype_js = {
    "Item": "public/js/override/item.js",
    "Homepage": "public/js/override/homepage.js",
}

doc_events = {
    "Item": {
        "on_update": [
            "webshop.webshop.crud_events.item.update_website_item.execute",
            "webshop.webshop.crud_events.item.invalidate_item_variants_cache.execute",
        ],
        "before_rename": [
            "webshop.webshop.crud_events.item.validate_duplicate_website_item.execute",
        ],
        "after_rename": [
            "webshop.webshop.crud_events.item.invalidate_item_variants_cache.execute",
        ],
    },
    "Sales Taxes and Charges Template": {
        "on_update": [
            "webshop.webshop.doctype.webshop_settings.webshop_settings.validate_cart_settings",
        ],
    },
    "Quotation": {
        "validate": [
            "webshop.webshop.crud_events.quotation.validate_shopping_cart_items.execute",
        ],
    },
    "Price List": {
        "validate": [
            "webshop.webshop.crud_events.price_list.check_impact_on_cart.execute"
        ],
    },
    "Tax Rule": {
        "validate": [
            "webshop.webshop.crud_events.tax_rule.validate_use_for_cart.execute",
        ],
    },
}

has_website_permission = {
    "Website Item": "webshop.webshop.doctype.website_item.website_item.has_website_permission_for_website_item",
    "Item Group": "webshop.webshop.doctype.website_item.website_item.has_website_permission_for_item_group"
}
