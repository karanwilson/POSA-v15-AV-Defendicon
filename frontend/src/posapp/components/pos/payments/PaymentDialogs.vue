<template>
	<div class="payment-dialogs">
		<!-- Custom Days Dialog -->
		<v-dialog
			:model-value="customDaysDialog"
			max-width="300px"
			:retain-focus="false"
			@update:model-value="$emit('update:customDaysDialog', $event)"
		>
			<v-card>
				<v-card-title class="text-h6">
					{{ $__("Custom Due Days") }}
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-text-field
							density="compact"
							variant="solo"
							type="number"
							min="0"
							max="365"
							class="sleek-field pos-themed-input"
							:model-value="customDaysValue"
							:label="$frappe._('Days')"
							hide-details
							@update:model-value="$emit('update:customDaysValue', parseFloat($event))"
						></v-text-field>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="$emit('update:customDaysDialog', false)">
						{{ $__("Close") }}
					</v-btn>
					<v-btn color="primary" theme="dark" @click="$emit('apply-custom-days')">
						{{ $__("Apply") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Phone Payment Dialog -->
		<v-dialog
			:model-value="phoneDialog"
			max-width="400px"
			:retain-focus="false"
			@update:model-value="$emit('update:phoneDialog', $event)"
		>
			<v-card v-if="invoiceDoc">
				<v-card-title>
					<span class="text-h5 text-primary">{{ $__("Confirm Mobile Number") }}</span>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-text-field
							density="compact"
							variant="solo"
							color="primary"
							:label="$frappe._('Mobile Number')"
							class="sleek-field pos-themed-input"
							hide-details
							v-model="invoiceDoc.contact_mobile"
							type="number"
						></v-text-field>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="$emit('update:phoneDialog', false)">
						{{ $__("Close") }}
					</v-btn>
					<v-btn color="primary" theme="dark" @click="$emit('request-payment')">
						{{ $__("Request") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- ICICI Payment Dialog -->
		<v-dialog
			:model-value="iciciDialog"
			max-width="600px"
			:retain-focus="false"
			@update:model-value="$emit('update:iciciDialog', $event)"
		>
			<v-card v-if="invoiceDoc">
				<v-card-title>
					<span class="text-h5 text-primary">{{ $__("Processing ICICI POS Payment") }}</span>
				</v-card-title>
				<v-row
					v-for="payment in invoiceDoc.payments"
					:key="payment.name"
				>
					<v-card-text class="pa-0" v-if="payment.amount != 0">
						<v-container>
							<v-text-field
								density="compact"
								variant="solo"
								color="primary"
								:label="$frappe._(payment.mode_of_payment)"
								class="sleek-field pos-themed-input"
								hide-details
								v-model="payment.amount"
								type="currency"
							></v-text-field>
						</v-container>
					</v-card-text>
				</v-row>
				<v-row>
					<v-card-text>
						ICICI POS status:
						<v-icon
							:color="upiOnlineColor"
						>mdi-point-of-sale</v-icon>
					</v-card-text>
					<v-card-text>
						Please scan Dynamic QR on POS Device <br>
						<br>
						After POS device confirmation, click the Check/Submit UPI button
					</v-card-text>
				</v-row>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="primary" theme="dark" @click="$emit('get-upi-confirmation')">
						{{ $__("Check/Submit UPI") }}
					</v-btn>
					<v-btn color="error" theme="dark" @click="$emit('cancel-upi-payment', false)">
						{{ $__("Cancel UPI") }}
					</v-btn>
					<v-btn color="warning" theme="dark" @click="$emit('bypass-dynamic-qr')">
						{{ $__("Bypass Dynamic QR") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup>
import { inject } from "vue";

defineProps({
	customDaysDialog: {
		type: Boolean,
		default: false,
	},
	customDaysValue: {
		type: Number,
		default: null,
	},
	phoneDialog: {
		type: Boolean,
		default: false,
	},
	iciciDialog: {
		type: Boolean,
		default: false,
	},
	upiOnlineColor: {
		type: String,
		default: 'grey',
	},
	invoiceDoc: {
		type: Object,
		required: true,
	},
});

defineEmits([
	"update:customDaysDialog",
	"update:customDaysValue",
	"apply-custom-days",
	"update:phoneDialog",
	"request-payment",
	"cancel-upi-payment",
	"get-upi-confirmation",
	"bypass-dynamic-qr",
]);

const $frappe = inject("frappe", window.frappe);
const $__ = inject("__", window.__);
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
