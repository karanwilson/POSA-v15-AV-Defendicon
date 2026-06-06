import { ref, unref, type Ref, type ComputedRef } from "vue";
// @ts-ignore
import { getSmartTenderSuggestions } from "../../../../utils/smartTender";
import { toCompanyCurrency } from "../../../utils/erpnextCurrency";
import { isCashLikePaymentLine } from "../../../utils/cashTender";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface PaymentMethodsOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	diffPayment?: ComputedRef<number>;
	getNetInvoiceAmount?: () => number;
	getNetCompanyAmount?: () => number;
	formatFloat?: (_val: any) => number;
	stores: {
		toastStore: any;
		uiStore: any;
	};
	eventBus?: any;
	onSubmit?: (_args: any, _submitPrint: boolean) => void;
	setRedeemCustomerCredit?: (_val: boolean) => void;
	customerCreditDict?: Ref<any[]>;
	redeemedCustomerCredit?: Ref<number>;
	isCashback?: Ref<boolean>;
	getTotalChange?: () => number;
	getPaidChange?: () => number;
	getCreditChange?: () => number;
	onBackToInvoice?: () => void;
	onPaymentInvoiceAmountChanged?: (
		_payment: any,
		_invoiceAmount: number,
		_companyAmount?: number,
	) => void | Promise<void>;
	onPaymentCleared?: (_payment: any) => void;
}

export function usePaymentMethods(options: PaymentMethodsOptions) {
	const {
		invoiceDoc,
		posProfile,
		// diffPayment,
		formatFloat,
		stores,
		eventBus,
		onSubmit,
	} = options;

	const mpesa_modes = ref<string[]>([]);
	const phone_dialog = ref(false);
	// Karan: Integrating ICICI POS
	const icici_dialog = ref(false);
	const upi_online_color = ref("grey");
	let erp_tran_id: String;
	let tranType: Number;
	let print: Boolean;
	let chargeableMOPupdate = false; // for updating charges in Back/Front-end

	const upi = ref(false);
	const aurocard = ref(false);

	const upi_trans_id = ref("");
	const aurocard_pos_id = ref("");
	const aurocard_trans_id = ref("");

	const flt = (v: any) =>
		formatFloat ? formatFloat(v) : parseFloat(String(v)) || 0;
	const syncPaymentCurrency = (payment: any, companyAmount?: number) => {
		if (options.onPaymentInvoiceAmountChanged) {
			void options.onPaymentInvoiceAmountChanged(
				payment,
				flt(payment.amount),
				companyAmount,
			);
		}
	};
	const clearPayment = (payment: any) => {
		payment.amount = 0;
		payment._posa_auto_remainder = false;
		if (payment.base_amount !== undefined) payment.base_amount = 0;
		if (options.onPaymentCleared) options.onPaymentCleared(payment);
	};

	const currencyContext = (doc = unref(invoiceDoc)) => ({
		...(doc || {}),
		pos_profile: unref(posProfile),
	});

	const getInvoiceSettlementAmount = () => {
		const doc = unref(invoiceDoc);
		if (!doc) return 0;

		if (typeof options.getNetInvoiceAmount === "function") {
			return flt(options.getNetInvoiceAmount());
		}

		return flt(doc.rounded_total || doc.grand_total);
	};

	// Get M-Pesa payment modes from backend
	const get_mpesa_modes = () => {
		const profile = unref(posProfile);
		const company = profile?.company;
		if (!company) return;

		frappe.call({
			method: "posawesome.posawesome.api.m_pesa.get_mpesa_mode_of_payment",
			args: { company, pos_profile: profile?.name },
			async: true,
			callback: function (r: any) {
				if (!r.exc) {
					mpesa_modes.value = r.message || [];
				} else {
					mpesa_modes.value = [];
				}
			},
		});
	};

	// Check if payment is M-Pesa C2B
	const is_mpesa_c2b_payment = (payment: any) => {
		if (
			mpesa_modes.value.includes(payment.mode_of_payment) &&
			payment.type === "Bank"
		) {
			payment.amount = 0;
			return true;
		} else {
			return false;
		}
	};

	const isCashLikePayment = (payment: any) => {
		return isCashLikePaymentLine(payment, unref(posProfile));
	};

	const reset_cash_payments = () => {
		const doc = unref(invoiceDoc);
		if (!doc || !doc.payments) return;

		doc.payments.forEach((payment: any) => {
			if (payment.mode_of_payment.toLowerCase() === "cash") {
				clearPayment(payment);
			}
		});
	};

	const autoBalancePayments = (
		excludePayment: any,
		_currencyPrecision: number = 2,
	) => {
		const doc = unref(invoiceDoc);
		if (!doc) return;

		// Auto-subtract from other payments if we have an excess
		const invoice_total = getInvoiceSettlementAmount();

		// Calculate current total paid
		const current_total_paid = doc.payments.reduce(
			(sum: number, p: any) => sum + flt(p.amount),
			0,
		);

		const excess = flt(current_total_paid - invoice_total);

		if (excess > 0) {
			// Find other payments with amount > 0 to reduce
			// We filter out the current payment being edited to avoid circular issues
			const otherPayments = doc.payments.filter(
				(p: any) => p !== excludePayment && flt(p.amount) > 0,
			);

			// Sort by amount descending to reduce larger chunks first
			otherPayments.sort(
				(a: any, b: any) => flt(b.amount) - flt(a.amount),
			);

			let remaining_excess = excess;

			for (const other of otherPayments) {
				if (remaining_excess <= 0) break;

				const otherAmount = flt(other.amount);
				const reduction = Math.min(otherAmount, remaining_excess);
				const newAmount = flt(otherAmount - reduction); // formatFloat handles precision if provided

				other.amount = newAmount;
				if (other.base_amount !== undefined) {
					other.base_amount = flt(
						toCompanyCurrency(currencyContext(doc), newAmount),
					);
				}
				syncPaymentCurrency(other);

				remaining_excess = flt(remaining_excess - reduction);
			}
		}
	};

	const getVisibleDenominations = (
		payment: any,
		_currencyPrecision: number = 2,
	) => {
		const doc = unref(invoiceDoc);
		if (!doc || !payment) return [];
		const currency = doc.currency;

		const current_total_paid = doc.payments.reduce(
			(sum: number, p: any) => sum + flt(p.amount),
			0,
		);
		const current_payment_amount = flt(payment.amount);
		const other_payments = current_total_paid - current_payment_amount;

		const invoice_total = flt(getInvoiceSettlementAmount());
		const amount_to_pay = invoice_total - other_payments;

		if (amount_to_pay <= 0) return [];

		return getSmartTenderSuggestions(amount_to_pay, currency);
	};

	// Open M-Pesa payment dialog
	const mpesa_c2b_dialog = (payment: any) => {
		const doc = unref(invoiceDoc);
		const company = unref(posProfile)?.company;
		const data = {
			company: company,
			mode_of_payment: payment.mode_of_payment,
			customer: doc.customer,
		};
		if (eventBus) {
			eventBus.emit("open_mpesa_payments", data);
		}
	};

	// Set M-Pesa payment as customer credit
	const set_mpesa_payment = (payment: any) => {
		const profile = unref(posProfile);
		if (profile) {
			profile.use_customer_credit = true;
		}

		if (options.setRedeemCustomerCredit) {
			options.setRedeemCustomerCredit(true);
		}

		const invoiceAmount = getInvoiceSettlementAmount();
		let amount =
			payment.unallocated_amount > invoiceAmount
				? invoiceAmount
				: payment.unallocated_amount;
		amount = amount > 0 ? amount : 0;
		const advance = {
			type: "Advance",
			credit_origin: payment.name,
			total_credit: flt(payment.unallocated_amount),
			credit_to_redeem: flt(amount),
		};

		clear_all_amounts();

		if (options.customerCreditDict) {
			options.customerCreditDict.value.push(advance);
		}
	};

	// Karan: adding functionality for Card charges
	const check_apply_chargeable_mop = async (
		mop,
		customer_group=""
	) => {
		chargeableMOPupdate = false; // reset to false
		const doc = unref(invoiceDoc);

		const r = await frappe.call({
			method: "posawesome.posawesome.api.payment_processing.utils.get_trans_fee_details",
			args: {
				company: doc.company,
				mop: mop,
			},
			async: true,
		});

		if (r.exc) {
			frappe.msgprint(r.exc);
		}

		//console.log('r.message["custom_customer_group"]: ', r.message["custom_customer_group"]);
		if (customer_group) {
			if (r?.message["custom_customer_group"] != customer_group) {
				const stricly_mapped_customer_group = ['Aurocard Payments', 'UPI Payments', 'MOP Cards', 'MOP RuPay', 'MOP Debit Card'];
				if (stricly_mapped_customer_group.includes(customer_group)) {
					return false;
				}
				// const cg_mop_map = await frappe.db.get_value("Customer Group", customer_group, 'custom_mop');
				// if (cg_mop_map.message["custom_mop"] != mop)
			}
		}

		const found = doc.taxes.find((row) => row.account_head === r.message["account_head"]);
		// console.log("check_apply_chargeable_mop found: ", found);
		// console.log("check_apply_chargeable_mop found: ", r.message);

		if (found && r.message["custom_transaction_fee_percentage"] == 0) {
			const index = doc.taxes.findIndex((tax) => tax.name == found.name);
			console.log("check_apply_chargeable_mop index: ", index);
			doc.taxes.splice(index, 1);
			chargeableMOPupdate = true;
		}

		else if (!found && r.message["custom_transaction_fee_percentage"] > 0) {
			const transaction_fee = flt(doc.grand_total * r.message["custom_transaction_fee_percentage"]/100);

			doc.taxes.push({
				account_head: r.message["account_head"],
				charge_type: "Actual",
				//charge_type: "On Net Total",
				description: __("{0} Charges", [mop]),
				//rate: r.message["custom_transaction_fee_percentage"],
				tax_amount: transaction_fee,
				cost_center: r.message["cost_center"],
				included_in_print_rate: 0,
			});
			console.log("usePaymentMethods.ts doc: ", doc);
			chargeableMOPupdate = true;
		}

		// Karan: Updating the backend/frontend Invoice when Chargeable MOP is set
		if (chargeableMOPupdate) {
			const updateResponse = await frappe.call({
				method: "posawesome.posawesome.api.invoices.update_invoice", // backend update
				args: { data: doc },
			});
			//console.log("Payments.vue syncPreferredPaymentToCurrentTotal updateResponse: ", updateResponse);

			if (updateResponse?.message) {
				updateResponse.message.payments = doc.payments; // updating calculated payments data
				Object.assign(doc, updateResponse.message); // frontend update
			}
		}

		return true;
	};

	// Set full amount for a payment mode
	const set_full_amount = async (payment: any, isReturn = false) => {
		const doc = unref(invoiceDoc);
		//console.log("doc.customer_group: ", doc.customer_group);

		// Karan: adding functionality for Card charges
		if (doc.company != "Pour Tous Distribution Center") {
			const check_mop_mapping_apply_tran_fee = await check_apply_chargeable_mop(payment.mode_of_payment, doc.customer_group);
			//console.log("check_mop_mapping_apply_tran_fee: ", check_mop_mapping_apply_tran_fee);

			// Checking Customer Group to MOP mapping
			if (!check_mop_mapping_apply_tran_fee) {
				stores.toastStore.show({
					title: __("Customer {0} not mapped with MOP {1}", [
						doc.customer_name,
						payment.mode_of_payment,
					]),
					color: "warning",
				});
				return;
			}
		}

		if (payment.mode_of_payment == "UPI") upi.value = true;
		else {
			upi.value = false;
			upi_trans_id.value = "";
		}

		if (payment.mode_of_payment == "Aurocard") aurocard.value = true;
		else {
			aurocard.value = false;
			aurocard_pos_id.value = "";
			aurocard_trans_id.value = "";
		}

		const invoiceAmount = getInvoiceSettlementAmount();
		// Reset other payments
		doc.payments.forEach((p: any) => {
			if (p.mode_of_payment !== payment.mode_of_payment) {
				clearPayment(p);
			}
		});

		payment._posa_auto_remainder = false;
		payment.amount = invoiceAmount;
		if (payment.base_amount !== undefined) {
			const baseAmount = toCompanyCurrency(
				currencyContext(doc),
				invoiceAmount,
			);
			payment.base_amount = isReturn ? -Math.abs(baseAmount) : baseAmount;
		}
		syncPaymentCurrency(payment);
	};

	const set_rest_amount = (payment: any, isReturn = false) => {
		const doc = unref(invoiceDoc);
		if (
			!doc?.payments ||
			!payment ||
			payment._posa_remainder_locked
		) {
			return;
		}
		const invoiceAmount = getInvoiceSettlementAmount();
		const currentPaid = doc.payments.reduce(
			(acc: number, p: any) => acc + flt(p.amount),
			0,
		);
		const currentPaymentAmount = flt(payment.amount);

		const otherPayments = currentPaid - currentPaymentAmount;
		let amount = invoiceAmount - otherPayments;
		amount = flt(amount);
		if (!isReturn) {
			amount = Math.max(amount, 0);
		}

		let companyAmount: number | undefined;
		if (typeof options.getNetCompanyAmount === "function") {
			const companyTarget = options.getNetCompanyAmount();
			const totalCompanyPayments = doc.payments.reduce(
				(sum: number, row: any) => sum + flt(row?.base_amount || 0),
				0,
			);
			const otherCompanyPayments =
				totalCompanyPayments - flt(payment.base_amount || 0);
			companyAmount = flt(companyTarget - otherCompanyPayments);
			if (!isReturn) companyAmount = Math.max(companyAmount, 0);
		}

		doc.payments.forEach((row: any) => {
			if (row !== payment) row._posa_auto_remainder = false;
		});
		payment.amount = amount;
		payment._posa_auto_remainder = true;
		if (payment.base_amount !== undefined) {
			const baseAmount =
				companyAmount ?? toCompanyCurrency(currencyContext(doc), amount);
			payment.base_amount = isReturn ? -Math.abs(baseAmount) : baseAmount;
		}
		syncPaymentCurrency(payment, companyAmount);
	};

	const toggle_remainder_lock = (payment: any) => {
		if (!payment) return;
		payment._posa_remainder_locked = !payment._posa_remainder_locked;
	};

	const clear_all_amounts = () => {
		const doc = unref(invoiceDoc);
		if (doc && doc.payments) {
			doc.payments.forEach((payment: any) => {
				clearPayment(payment);
			});
		}
	};

	const request_payment = async (_params?: any) => {
		const doc = unref(invoiceDoc);
		phone_dialog.value = false;

		if (!doc.contact_mobile) {
			stores.toastStore.show({
				title: __("Please set the customer's mobile number"),
				color: "error",
			});
			if (eventBus) eventBus.emit("open_edit_customer");
			if (options.onBackToInvoice) options.onBackToInvoice();
			return;
		}

		stores.uiStore.freeze(__("Waiting for payment..."));

		try {
			doc.payments.forEach((payment: any) => {
				payment.amount = flt(payment.amount);
			});

			const argsData = {
				...doc,
				total_change: options.getTotalChange
					? options.getTotalChange()
					: 0,
				paid_change: options.getPaidChange
					? options.getPaidChange()
					: 0,
				credit_change: options.getCreditChange
					? options.getCreditChange()
					: 0,
				redeemed_customer_credit:
					options.redeemedCustomerCredit?.value || 0,
				customer_credit_dict: options.customerCreditDict?.value || [],
				is_cashback: options.isCashback?.value || false,
			};

			const updateResponse = await frappe.call({
				method: "posawesome.posawesome.api.invoices.update_invoice",
				args: { data: argsData },
			});

			if (updateResponse?.message) {
				Object.assign(doc, updateResponse.message);
			}

			const paymentResponse = await frappe.call({
				method: "posawesome.posawesome.api.payments.create_payment_request",
				args: { doc: doc },
			});

			const payment_request_name = paymentResponse?.message?.name;
			if (!payment_request_name) {
				throw new Error("Payment request failed");
			}

			await new Promise<void>((resolve, reject) => {
				setTimeout(async () => {
					try {
						const { message } = await frappe.db.get_value(
							"Payment Request",
							payment_request_name,
							["status", "grand_total"],
						);

						if (!message) {
							stores.toastStore.show({
								title: __(
									"Payment request status could not be retrieved. Please try again",
								),
								color: "error",
							});
							resolve();
							return;
						}

						if (message.status !== "Paid") {
							stores.toastStore.show({
								title: __(
									"Payment Request took too long to respond. Please try requesting for payment again",
								),
								color: "error",
							});
							resolve();
							return;
						}

						stores.toastStore.show({
							title: __("Payment of {0} received successfully.", [
								message.grand_total,
							]),
							color: "success",
						});

						const newDoc = await frappe.db.get_doc(
							doc.doctype,
							doc.name,
						);
						Object.assign(doc, newDoc);

						if (onSubmit) onSubmit(null, true);
						resolve();
					} catch (error) {
						reject(error);
					}
				}, 30000);
			});
		} catch (error: any) {
			console.error("Payment request error:", error);
			stores.toastStore.show({
				title: __(error.message || "Payment request failed"),
				color: "error",
			});
		} finally {
			stores.uiStore.unfreeze();
		}
	};

	// Karan
    const make_fs_payment = (
		fs_amount: number,
		fsBalanceAvailable: string,
	) => {
		return new Promise(async (resolve, reject) => {
			const doc = unref(invoiceDoc);
			// console.log("usePaymentMethods fsBalanceAvailable", fsBalanceAvailable);
			// console.log("usePaymentMethods doc: ", doc);

			const r = await frappe.call({
				method: "payments.payment_gateways.doctype.fs_settings.fs_settings.add_transfer_billing",
				args: {
					invoice_doc: doc,
					fAmount: fs_amount,
					fs_acc_balance: fsBalanceAvailable,
				},
			});

			let res = {};
			if (r.message) {
				res["custom_fs_transfer_status"] = r.message["custom_fs_transfer_status"];
				res["strDescription"] = r.message["strDescription"]
				// if (remarks)
				// 	doc.remarks += "\n\n" + r.message["remarks"]; // in case of remarks
				// else if (r.message["remarks"] != "Null") // In case of "Insufficient Funds"
				//if (r.message["remarks"] != "Null") // In case of "Insufficient Funds"
				res["remarks"] = r.message["remarks"];

				if (res["custom_fs_transfer_status"] == "OK") {
					resolve(res);
				}
				else if (res["custom_fs_transfer_status"] == "Insufficient Funds" ||
					res["custom_fs_transfer_status"] == "Failed" || res["custom_fs_transfer_status"] == "Queued") {
						res["is_credit_sale"] = true;
						//doc.custom_fs_transfer_status = "Insufficient Funds";
						//doc.outstanding_amount = fs_amount;
						//doc.due_date = frappe.datetime.month_end(); // setting the due_date for is_credit_sale (if set) to last day of the month
						resolve(res);
				}
				else {
					stores.toastStore.show({
						title: __(res["custom_fs_transfer_status"]),
						color: "error",
					});
					reject(res);
				}
			}
			else if (r.exc) {
				frappe.msgprint(r.exc);
				reject(r.exc);
			}
			else {
				stores.toastStore.show({
					title: __("Payment Unsuccessfull"),
					color: "error",
				});
				res["error"] = "Payment Unsuccessfull";
				reject(res);
			}
		})
    };

	// Karan
    const make_aurocard_payment = () => {
      return new Promise((resolve, reject) => {
        if (!(aurocard_pos_id.value && aurocard_trans_id.value)) {
			stores.toastStore.show({
				title: __("Please enter both 'Aurocard POS ID' and 'Aurocard Transaction ID"),
				color: "warning",
			});
          reject("Please enter both 'Aurocard POS ID' and 'Aurocard Transaction ID");
        }
        else resolve("OK");
      })
    };

	// Karan
    const make_upi_payment = () => {
      return new Promise((resolve, reject) => {
        if (!upi_trans_id.value) {
			stores.toastStore.show({
				title: __("Please enter the 'UPI Transaction ID' OR enter remarks (eg.: Not Shared)"),
				color: "warning",
			});
          reject("Please enter the 'UPI Transaction ID' OR enter remarks (eg.: Not Shared)");
        }
        else resolve("OK");
      })
    };

	// Karan
    const make_icici_upi_payment = (
		tran_type: number,
		upi_amount: number,
		print_upi: boolean,
	) => {
		return new Promise(async (resolve, reject) => {
			const doc = unref(invoiceDoc);
			icici_dialog.value = true;
			print = print_upi;

			if (navigator.onLine) {
				const r = await frappe.call({
					method: "payments.payment_gateways.doctype.upi_settings.upi_settings.push_txn",
					args: {
						invoice_doc: doc,
						tran_type: tran_type, //16 - UPI, 1 - Card
						amount: upi_amount,
					},
					async: false,
				});
				if (r.message) {
					console.log('r.message: ', r.message);

					if (r.message["ResponseCode"] == "00" && r.message['ir_status'] == "Completed") {
						icici_dialog.value = false;
						resolve(r.message);
					}
					else if (r.message["ResponseCode"] == "00" || r.message["ResponseDesc"] == "Success") {
						upi_online_color.value = "success";
						erp_tran_id = r.message["erp_tran_id"];

						if ("TranType" in r.message) {
							if (r.message["TranType"] == "UPI") tranType = 16;
							else if (r.message["TranType"] == "Sale") tranType = 1;
						}
						else tranType = tran_type;
						//const txn_status = await vm.get_upi_confirmation(r.message["erp_tran_id"], tran_type);
						// check txn_status for Success or Fail
						//resolve(txn_status);
						console.log("tranType: ", tranType);
					}
					else {
						stores.toastStore.show({
							title: __(`Please check the Network/Service/POS availability. ResponseCode: {0}, ResponseDesc: {1}`, [
								r.message["ResponseCode"],
								r.message["ResponseDesc"]
							]),
							color: "error",
						});
						reject("Payment Unsuccessfull");
					}
				}
				else if (r.exc) {
					frappe.msgprint(r.exc);
					reject(r.exc);
				}
			}
			else {
				const message = "Network availability: " + navigator.onLine;
				stores.toastStore.show({
					title: message,
					color: "error",
				});
			}

		})
    };

	// Karan
    const get_upi_confirmation = async () => {
		const doc = unref(invoiceDoc);

		if (navigator.onLine) {
			const r = await frappe.call({
				method: "payments.payment_gateways.doctype.upi_settings.upi_settings.get_upi_confirmation",
				args: {
					bill_no: doc.name,
					tran_type: tranType, //16 - UPI, 1 - Card
					erp_tran_id: erp_tran_id
				},
				async: false,
			});
			let res = {};

			if (r.message) {
				console.log("r.message: ", r.message);
				if (r.message['ResponseCode'] == '00' || r.message["ResponseDesc"] ==  "SUCCESS" || r.message["ResponseDesc"] == "Approved or completed successfully") {
					icici_dialog.value = false;
					res = r.message;
					// returning print and tranType values passed via make_icici_upi_payment() above
					res["print"] = print;
					res["tran_type"] = tranType;
					return(res);
				}
				else {
					stores.toastStore.show({
						title: __(`Please wait for Customer Device confirmation, or check the Network/Service/POS availability.\n ResponseCode: {0}, ResponseDesc: {1}`, [
							r.message["ResponseCode"],
							r.message["ResponseDesc"]
						]),
						color: "warning",
					});
					console.log(r.message);
				}
			}
			else if (r.exc) {
				frappe.msgprint(r.exc);
				// return;
			}
		}
		else {
			const message = "Network availability: " + navigator.onLine;
			stores.toastStore.show({
				title: message,
				color: "error",
			});
		}
    };

    const cancel_upi_payment = async () => {
      const doc = unref(invoiceDoc);

		if (erp_tran_id) {
			if (navigator.onLine) {
				const r = await frappe.call({
					method: 'payments.payment_gateways.doctype.upi_settings.upi_settings.cancel_txn',
					args: {
						bill_no: doc.name,
						tran_type: tranType, //16 - UPI, 1 - Card
						erp_tran_id: erp_tran_id
					},
					async: false,
				});

				if (r.message) {
					stores.toastStore.show({
						title: __(`POS Transaction cancelled. ResponseCode: {0}, ResponseDesc: {1}`, [
							r.message["RspCode"],
							r.message["RspDesc"]
						]),
						color: "warning",
					});
					console.log(r.message);
					icici_dialog.value = false;
				}
				else if (r.exc) {
					frappe.msgprint(r.exc);
					// return;
				}
				else icici_dialog.value = false;
			}
			else {
				const message = "Network availability: " + navigator.onLine;
				stores.toastStore.show({
					title: message,
					color: "error",
				});
				icici_dialog.value = false;
			}
		}
		else icici_dialog.value = false;
    };

	// Karan
    const bypass_dynamic_qr = () => {
      	icici_dialog.value = false;
		stores.toastStore.show({
			title: __(`Bypassed Dynamic QR for POS Transaction`),
			color: "info",
		});
		return print;
    };

	return {
		mpesa_modes,
		phone_dialog,
		get_mpesa_modes,
		is_mpesa_c2b_payment,
		mpesa_c2b_dialog,
		set_mpesa_payment,
		set_full_amount,
		set_rest_amount,
		toggle_remainder_lock,
		clear_all_amounts,
		request_payment,
		autoBalancePayments,
		getVisibleDenominations,
		isCashLikePayment,
		reset_cash_payments,
		// Karan
		aurocard,
		aurocard_pos_id,
		aurocard_trans_id,
		icici_dialog,
		upi_online_color,
		upi,
		upi_trans_id,
		make_fs_payment,
		make_aurocard_payment,
		make_upi_payment,
		make_icici_upi_payment,
		get_upi_confirmation,
		cancel_upi_payment,
		bypass_dynamic_qr,
		check_apply_chargeable_mop, 
	};
}
