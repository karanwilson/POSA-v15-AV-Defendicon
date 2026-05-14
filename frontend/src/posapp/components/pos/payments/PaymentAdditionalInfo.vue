<template>
	<div v-if="invoiceDoc">
		<!-- Additional Invoice Information (Delivery, Address, Notes, etc.) -->
		<v-row class="pa-1">
			<v-col cols="6">
				<v-switch
					v-model="remarks"
					flat
					:label="frappe._('Remarks')"
					class="my-0 py-0"
				></v-switch>
			</v-col>
			<v-col cols="6" v-if="remarks">
				<v-text-field
					v-model="invoiceDoc.remarks"
					:label="frappe._('Remarks')"
					outlined
					dense
					hide-details
					color="primary"
				></v-text-field>
			</v-col>
			<v-col cols="6" v-if="!invoiceDoc.is_return">
				<v-switch
					v-model="staffCustomerDetail"
					flat
					:label="frappe._('Staff/Customer Detail')"
					class="my-0 py-0"
				></v-switch>
			</v-col>
			<v-col cols="6" v-if="staffCustomerDetail">
				<v-text-field
					v-model="invoiceDoc.custom_staff_customer_detail"
					:label="frappe._('Staff/Customer Detail')"
					outlined
					dense
					hide-details
					color="primary"
				></v-text-field>
			</v-col>
			<!-- Aurocard/UPI ID (if applicable) -->
			<v-col cols="6" v-show="aurocard">
				<v-text-field
					dense
					outlined
					color="primary"
					:label="frappe._('Aurocard POS ID')"
					background-color="white"
					hide-details
					:model-value="aurocardPosId"
					@update:model-value="$emit('update:aurocardPosId', $event)"
				></v-text-field>
			</v-col>
			<v-col cols="6" v-show="aurocard">
				<v-text-field
					dense
					outlined
					color="primary"
					:label="frappe._('Aurocard Transaction ID')"
					background-color="white"
					hide-details
					:model-value="aurocardTransId"
					@update:model-value="$emit('update:aurocardTransId', $event)"
				></v-text-field>
			</v-col>
			<v-col cols="6" v-show="upi">
				<v-text-field
					dense
					outlined
					color="primary"
					:label="frappe._('UPI Transaction ID')"
					background-color="white"
					hide-details
					:model-value="upiTransId"
					@update:model-value="$emit('update:upiTransId', $event)"
				></v-text-field>
			</v-col>
			<!-- Delivery Date and Address (if applicable) -->
			<v-col cols="6" v-if="posProfile.posa_allow_sales_order && invoiceType === 'Order'">
				<VueDatePicker
					:model-value="newDeliveryDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="new Date()"
					auto-apply
					class="sleek-field pos-themed-input"
					@update:model-value="$emit('update:newDeliveryDate', $event)"
				/>
			</v-col>
			<v-col cols="6" v-if="returnValidityEnabled && !invoiceDoc.is_return">
				<VueDatePicker
					:model-value="returnValidUptoDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="returnValidityMinDate"
					:enable-time-picker="false"
					auto-apply
					class="sleek-field pos-themed-input"
					:placeholder="$frappe._('Return Valid Until')"
					@update:model-value="$emit('update:returnValidUptoDate', $event)"
				/>
			</v-col>
			<!-- Shipping Address Selection (if delivery date is set) -->
			<v-col cols="12" v-if="invoiceDoc.posa_delivery_date">
				<v-autocomplete
					density="compact"
					clearable
					auto-select-first
					variant="solo"
					color="primary"
					:label="$frappe._('Address')"
					v-model="invoiceDoc.shipping_address_name"
					:items="addresses"
					item-title="display_title"
					item-value="name"
					class="sleek-field pos-themed-input"
					:no-data-text="$__('Address not found')"
					hide-details
					:custom-filter="addressFilter"
					append-icon="mdi-plus"
					@click:append="$emit('new-address')"
				>
					<template v-slot:item="{ props, item }">
						<v-list-item v-bind="props">
							<v-list-item-title class="text-primary text-subtitle-1">
								<div>{{ (item?.raw && item.raw.address_title) || item.address_title }}</div>
							</v-list-item-title>
							<v-list-item-subtitle>
								<div>{{ (item?.raw && item.raw.address_line1) || item.address_line1 }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle
								v-if="(item?.raw && item.raw.address_line2) || item.address_line2"
							>
								<div>{{ (item?.raw && item.raw.address_line2) || item.address_line2 }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.city) || item.city">
								<div>{{ (item?.raw && item.raw.city) || item.city }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.state) || item.state">
								<div>{{ (item?.raw && item.raw.state) || item.state }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.country) || item.country">
								<div>{{ (item?.raw && item.raw.country) || item.country }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.mobile_no) || item.mobile_no">
								<div>{{ (item?.raw && item.raw.mobile_no) || item.mobile_no }}</div>
							</v-list-item-subtitle>
							<v-list-item-subtitle
								v-if="(item?.raw && item.raw.address_type) || item.address_type"
							>
								<div>{{ (item?.raw && item.raw.address_type) || item.address_type }}</div>
							</v-list-item-subtitle>
						</v-list-item>
					</template>
				</v-autocomplete>
			</v-col>

			<!-- Additional Notes (if enabled in POS profile) -->
			<v-col cols="12" v-if="posProfile.posa_display_additional_notes">
				<v-textarea
					class="pa-0 sleek-field"
					variant="solo"
					density="compact"
					clearable
					color="primary"
					auto-grow
					rows="2"
					:label="$frappe._('Additional Notes')"
					v-model="invoiceDoc.posa_notes"
				></v-textarea>
			</v-col>
			<v-col cols="12" md="6" v-if="posProfile.posa_display_authorization_code">
				<v-text-field
					class="sleek-field pos-themed-input"
					variant="solo"
					density="compact"
					clearable
					color="primary"
					:label="$frappe._('Authorization Code')"
					v-model="invoiceDoc.posa_authorization_code"
					hide-details
					autocomplete="off"
					maxlength="32"
				></v-text-field>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
import { inject } from "vue";
import { ref } from "vue";

defineProps({
	invoiceDoc: {
		type: Object,
		required: true,
	},
	posProfile: {
		type: [Object, String],
		default: () => ({}),
	},
	invoiceType: {
		type: String,
		default: "Invoice",
	},
	aurocard: {
		type: Boolean,
		default: "false",
	},
	upi: {
		type: Boolean,
		default: "false",
	},
	aurocardPosId: {
		type: String,
		default: "false",
	},
	aurocardTransId: {
		type: String,
		default: "false",
	},
	upiTransId: {
		type: String,
		default: "false",
	},
	returnValidityEnabled: {
		type: Boolean,
		default: false,
	},
	returnValidityMinDate: {
		type: Date,
		default: () => new Date(),
	},
	addresses: {
		type: Array,
		default: () => [],
	},
	newDeliveryDate: {
		type: String,
		default: null,
	},
	returnValidUptoDate: {
		type: String,
		default: null,
	},
	addressFilter: {
		type: Function,
		default: () => true,
	},
});

defineEmits([
	"update:newDeliveryDate", "update:returnValidUptoDate", "new-address",
	"update:aurocardPosId", "update:aurocardTransId", "update:upiTransId",
]);

const $frappe = inject("frappe", window.frappe);
const $__ = inject("__", window.__);

const remarks = ref(false);
const staffCustomerDetail = ref(false);

</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
