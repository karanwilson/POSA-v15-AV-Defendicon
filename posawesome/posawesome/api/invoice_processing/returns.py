import frappe
import time
from collections import defaultdict
from frappe import _
from frappe.utils import (
    cint,
    flt,
    getdate,
    nowdate,
)
from posawesome.posawesome.api.invoice_processing.utils import _get_return_validity_settings
from posawesome.posawesome.api.utils import log_perf_event


@frappe.whitelist()
def search_invoices_for_return(
    invoice_name,
    company,
    customer_name=None,
    customer_id=None,
    custom_fs_account_number=None,
    item_code=None,
    mobile_no=None,
    tax_id=None,
    from_date=None,
    to_date=None,
    min_amount=None,
    max_amount=None,
    page=1,
    pos_profile=None,
    doctype="Sales Invoice",
):
    """
    Search for invoices that can be returned with separate customer search fields and pagination

    Args:
        invoice_name: Invoice ID to search for
        company: Company to search in
        customer_name: Customer name to search for
        customer_id: Customer ID to search for
        custom_fs_account_number: Customer FS Account to search for
        item_code: Return Invoices with this Item only
        mobile_no: Mobile number to search for
        tax_id: Tax ID to search for
        from_date: Start date for filtering
        to_date: End date for filtering
        min_amount: Minimum invoice amount to filter by
        max_amount: Maximum invoice amount to filter by
        page: Page number for pagination (starts from 1)

    Returns:
        Dictionary with:
        - invoices: List of invoice documents
        - has_more: Boolean indicating if there are more invoices to load
    """
    started_at = time.perf_counter()
    enforce_return_validity, _ = _get_return_validity_settings(pos_profile)

    # Start with base filters
    filters = {
        "company": company,
        "docstatus": 1,
        "is_return": 0,
    }

    # Normalize page number input
    try:
        page = int(page or 1)
    except (TypeError, ValueError):
        page = 1
    if page < 1:
        page = 1

    # Items per page - can be adjusted based on performance requirements
    page_length = 100
    start = (page - 1) * page_length

    if item_code:
        # If item_code search criteria is provided, find matching invoices
        invoice_ids = []
        if invoice_name or custom_fs_account_number:
            conditions = [
                "si.company = %(company)s", "si.docstatus = %(docstatus)s", "si.is_return = %(is_return)s",
                "sii.parent = si.name", "sii.parenttype = %(doctype)s", "sii.item_code = %(item_code)s"
            ]
            params = {
                "company": company,
                "docstatus": 1,
                "is_return": 0,
                "doctype": doctype,
                "item_code": item_code,
            }

            if invoice_name:
                conditions.append("si.name LIKE %(invoice_name)s")
                params["invoice_name"] = f"%{invoice_name}%"

            if custom_fs_account_number:
                conditions.append("si.custom_fs_account_number = %(custom_fs_account_number)s")
                params["custom_fs_account_number"] = custom_fs_account_number

            # Build the WHERE clause for the query
            where_clause = " AND ".join(conditions)
            invoice_query = f"""
            SELECT si.name
            FROM `tabSales Invoice` si, `tabSales Invoice Item` sii
            WHERE {where_clause}
            LIMIT 100
            """

            invoices = frappe.db.sql(invoice_query, params, as_dict=True)
            if invoices:
                invoice_ids = [i.name for i in invoices]

                # If we found matching invoices, add them to the filter
                filters = {} # because these are already included in params above, with results in filters["invoice"] below
                filters["name"] = ["in", invoice_ids]

            elif any([invoice_name, custom_fs_account_number, item_code]):
                log_perf_event(
                    "search_invoices_for_return",
                    started_at,
                    doctype=doctype,
                    page=page,
                    rows=0,
                    invoice_matches=0,
                    early_exit=1,
                )
                return {"invoices": [], "has_more": False}

    else:
        # Add invoice name filter if provided
        if invoice_name:
            filters["name"] = ["like", f"%{invoice_name}%"]
        
        # Add custom_fs_account_number filter if provided
        if custom_fs_account_number:
            filters["custom_fs_account_number"] = ["=", custom_fs_account_number]

    # Add date range filters if provided
    if from_date:
        filters["posting_date"] = [">=", from_date]

    if to_date:
        if "posting_date" in filters:
            filters["posting_date"] = ["between", [from_date, to_date]]
        else:
            filters["posting_date"] = ["<=", to_date]

    # Add amount filters if provided
    if min_amount:
        filters["grand_total"] = [">=", float(min_amount)]

    if max_amount:
        if "grand_total" in filters:
            # If min_amount was already set, change to between
            filters["grand_total"] = ["between", [float(min_amount), float(max_amount)]]
        else:
            filters["grand_total"] = ["<=", float(max_amount)]

    # If any customer search criteria is provided, find matching customers
    customer_ids = []
    if customer_name or customer_id or mobile_no or tax_id:
        conditions = []
        params = {}

        if customer_name:
            conditions.append("customer_name LIKE %(customer_name)s")
            params["customer_name"] = f"%{customer_name}%"

        if customer_id:
            conditions.append("name LIKE %(customer_id)s")
            params["customer_id"] = f"%{customer_id}%"

        if mobile_no:
            conditions.append("mobile_no LIKE %(mobile_no)s")
            params["mobile_no"] = f"%{mobile_no}%"

        if tax_id:
            conditions.append("tax_id LIKE %(tax_id)s")
            params["tax_id"] = f"%{tax_id}%"

        # Build the WHERE clause for the query
        where_clause = " OR ".join(conditions)
        customer_query = f"""
        SELECT name
        FROM `tabCustomer`
        WHERE {where_clause}
        LIMIT 100
        """

        customers = frappe.db.sql(customer_query, params, as_dict=True)
        customer_ids = [c.name for c in customers]

        # If we found matching customers, add them to the filter
        if customer_ids:
            filters["customer"] = ["in", customer_ids]
        # If customer search criteria provided but no matches found, return empty
        elif any([customer_name, customer_id, mobile_no, tax_id]):
            log_perf_event(
                "search_invoices_for_return",
                started_at,
                doctype=doctype,
                page=page,
                rows=0,
                customer_matches=0,
                early_exit=1,
            )
            return {"invoices": [], "has_more": False}

    # Get invoices matching all criteria with pagination (+1 row for has_more)
    invoices_list = frappe.get_list(
        doctype,
        filters=filters,
        fields=[
            "name",
            "company",
            "customer",
            "customer_name",
            "custom_fs_account_number",
            "posting_date",
            "posting_time",
            "grand_total",
            "currency",
            "discount_amount",
            "additional_discount_percentage",
            "posa_return_valid_upto",
            "is_return",
        ],
        limit_start=start,
        limit_page_length=page_length + 1,
        order_by="posting_date desc, name desc",
    )

    has_more = len(invoices_list) > page_length
    if has_more:
        invoices_list = invoices_list[:page_length]

    if not invoices_list:
        log_perf_event(
            "search_invoices_for_return",
            started_at,
            doctype=doctype,
            page=page,
            rows=0,
            has_more=0,
            customer_matches=len(customer_ids),
        )
        return {"invoices": [], "has_more": False}

    data = []
    for invoice in invoices_list:
        invoice["doctype"] = doctype

        # Validation checks logic
        validity_date = invoice.get("posa_return_valid_upto")
        expired = False
        if enforce_return_validity and validity_date:
            expired = getdate(nowdate()) > getdate(validity_date)
        invoice["posa_return_expired"] = cint(expired)

        data.append(invoice)

    total_count = (start + len(data) + 1) if has_more else (start + len(data))

    result = {
        "invoices": data,
        "has_more": has_more,
        "total_count": total_count,
    }
    log_perf_event(
        "search_invoices_for_return",
        started_at,
        doctype=doctype,
        page=page,
        rows=len(data),
        has_more=int(bool(has_more)),
        customer_matches=len(customer_ids),
    )
    return result


@frappe.whitelist()
def get_invoice_for_return(invoice_name, pos_profile=None, doctype="Sales Invoice"):
    """Return one invoice with returnable item quantities after past returns."""
    started_at = time.perf_counter()
    enforce_return_validity, _ = _get_return_validity_settings(pos_profile)

    invoice_doc = frappe.get_cached_doc(doctype, invoice_name)
    invoice = {
        "name": invoice_doc.name,
        "doctype": doctype,
        "customer": invoice_doc.customer,
        "customer_name": invoice_doc.customer_name,
        "grand_total": invoice_doc.grand_total,
        "total": invoice_doc.total,
        "net_total": invoice_doc.net_total,
        "currency": invoice_doc.currency,
        "discount_amount": invoice_doc.discount_amount,
        "additional_discount_percentage": invoice_doc.additional_discount_percentage,
        "posa_return_valid_upto": invoice_doc.get("posa_return_valid_upto"),
        "payments": [
            {
                "mode_of_payment": payment.get("mode_of_payment"),
                "amount": payment.get("amount"),
                "base_amount": payment.get("base_amount"),
                "default": payment.get("default"),
                "account": payment.get("account"),
                "type": payment.get("type"),
                "currency": payment.get("currency"),
                "conversion_rate": payment.get("conversion_rate"),
            }
            for payment in (invoice_doc.get("payments") or [])
        ],
    }

    if invoice_doc.custom_fs_account_number and invoice_doc.status != "Paid":
        invoice["unpaid_fs_invoice"] = "true"
        return invoice

    meta = frappe.get_meta(doctype)
    item_field = meta.get_field("items")
    item_doctype = item_field.options if item_field else None
    if not item_doctype:
        log_perf_event(
            "get_invoice_for_return",
            started_at,
            doctype=doctype,
            invoice=invoice_name,
            rows=0,
            fully_returned=0,
        )
        return invoice

    returned_items = frappe.get_all(
        doctype,
        filters={
            "return_against": invoice_name,
            "docstatus": 1,
            "is_return": 1,
        },
        fields=["name"],
    )

    returned_qty_by_code = defaultdict(float)
    returned_names = [row.name for row in returned_items]
    if returned_names:
        returned_rows = frappe.get_all(
            item_doctype,
            filters={"parent": ["in", returned_names], "parenttype": doctype},
            fields=["item_code", "qty"],
        )
        for row in returned_rows:
            item_code = row.get("item_code")
            if not item_code:
                continue
            returned_qty_by_code[item_code] += abs(flt(row.get("qty") or 0))

    filtered_items = []
    for item in invoice_doc.get("items") or []:
        item_code = item.get("item_code")
        remaining_qty = flt(item.get("qty") or 0) - flt(returned_qty_by_code.get(item_code, 0))
        if remaining_qty > 0:
            filtered_items.append(
                {
                    "name": item.get("name"),
                    "item_code": item.get("item_code"),
                    "item_name": item.get("item_name"),
                    "description": item.get("description"),
                    "uom": item.get("uom"),
                    "stock_uom": item.get("stock_uom"),
                    "conversion_factor": item.get("conversion_factor"),
                    "warehouse": item.get("warehouse"),
                    "batch_no": item.get("batch_no"),
                    "serial_no": item.get("serial_no"),
                    "is_free_item": item.get("is_free_item"),
                    "rate": item.get("rate"),
                    "price_list_rate": item.get("price_list_rate"),
                    "discount_percentage": item.get("discount_percentage"),
                    "discount_amount": item.get("discount_amount"),
                    "net_rate": item.get("net_rate"),
                    "net_amount": item.get("net_amount"),
                    "qty": remaining_qty,
                    "stock_qty": item.get("stock_qty"),
                    "amount": item.get("amount"),
                }
            )

    invoice["items"] = filtered_items
    invoice["is_fully_returned"] = 1 if (invoice_doc.items and not filtered_items) else 0

    validity_date = invoice.get("posa_return_valid_upto")
    expired = False
    if enforce_return_validity and validity_date:
        expired = getdate(nowdate()) > getdate(validity_date)
    invoice["posa_return_expired"] = cint(expired)

    log_perf_event(
        "get_invoice_for_return",
        started_at,
        doctype=doctype,
        invoice=invoice_name,
        rows=len(filtered_items),
        fully_returned=int(bool(invoice.get("is_fully_returned"))),
    )
    return invoice


@frappe.whitelist()
def validate_return_items(original_invoice_name, return_items, doctype="Sales Invoice"):
    """
    Ensure that return items do not exceed the quantity from the original invoice.
    """
    meta = frappe.get_meta(doctype)
    item_field = meta.get_field("items")
    item_doctype = item_field.options if item_field else None
    if not item_doctype:
        return {"valid": True}

    original_item_qty = {}

    original_items = frappe.get_all(
        item_doctype,
        filters={"parent": original_invoice_name, "parenttype": doctype},
        fields=["item_code", "qty"],
    )
    for item in original_items:
        original_item_qty[item.item_code] = original_item_qty.get(item.item_code, 0) + flt(item.qty or 0)

    returned_items = frappe.get_all(
        doctype,
        filters={
            "return_against": original_invoice_name,
            "docstatus": 1,
            "is_return": 1,
        },
        fields=["name"],
    )

    returned_names = [row.name for row in returned_items]
    if returned_names:
        returned_rows = frappe.get_all(
            item_doctype,
            filters={"parent": ["in", returned_names], "parenttype": doctype},
            fields=["item_code", "qty"],
        )
        for item in returned_rows:
            if item.item_code in original_item_qty:
                original_item_qty[item.item_code] -= abs(flt(item.qty or 0))

    for item in return_items:
        item_code = item.get("item_code")
        return_qty = abs(item.get("qty", 0))
        if item_code in original_item_qty and return_qty > original_item_qty[item_code]:
            return {
                "valid": False,
                "message": _("You are trying to return more quantity for item {0} than was sold.").format(
                    item_code
                ),
            }

    return {"valid": True}
