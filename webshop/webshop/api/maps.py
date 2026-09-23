"""Map/geocoding configuration for the checkout address form.

PR-Foundry fork addition (checkout address form design, 2026-09-24). Upstream webshop has
no file of this name, so it cannot conflict on a sync.
"""

import frappe


@frappe.whitelist(allow_guest=True)
def get_places_key() -> str | None:
	"""The Google browser API key for Places autocomplete, or ``None`` when unconfigured.

	``allow_guest`` because a webshop checkout runs before login.

	Returning a key to the page is deliberate and not a leak: ``Google Settings.api_key``
	is a *browser* key by Google's definition and by frappe's own field description ("The
	browser API key obtained from the Google Cloud Console"), and a browser key is only
	ever usable from a page. What stops it being spent by someone else is the HTTP-referrer
	restriction set in the Cloud console -- withholding it from the page that must use it
	protects nothing and simply breaks the feature.

	Returns ``None`` when the integration is disabled or the key is blank, so the caller
	degrades to manual address entry rather than loading a script that will fail.
	"""
	settings = frappe.get_cached_doc("Google Settings")
	if not settings.enable:
		return None
	return (settings.api_key or "").strip() or None
