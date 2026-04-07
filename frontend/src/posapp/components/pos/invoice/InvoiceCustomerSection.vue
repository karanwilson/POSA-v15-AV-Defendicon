<template>
	<v-row align="center" class="items px-3 py-2">
		<v-col :cols="pos_profile.posa_allow_sales_order ? 8 : 10" class="pb-0 pr-0">
			<!-- Customer selection component -->
			<Customer ref="customerComponent" />
		</v-col>

		<!-- Invoice Type Selection (Only shown if sales orders are allowed) -->
		<v-col v-if="pos_profile.posa_allow_sales_order" cols="2" class="pb-4">
			<v-select
				density="compact"
				hide-details
				variant="solo"
				color="primary"
				class="sleek-field pos-themed-input"
				:items="invoiceTypes"
				:label="frappe._('Type')"
				:model-value="modelValue"
				@update:model-value="$emit('update:modelValue', $event)"
				:disabled="modelValue == 'Return'"
			></v-select>
		</v-col>

		<!-- FS Balance Component comes here -->
		<v-col cols="1" class="pb-4">
			<div class="gadget-wrapper status-gadget">
				<slot name="fs-balance-indicator"></slot>
			</div>
		</v-col>
	</v-row>
</template>

<script setup>
import { ref } from "vue";
import Customer from "../customer/Customer.vue";

defineProps({
	pos_profile: {
		type: Object,
		required: true,
		default: () => ({}),
	},
	invoiceTypes: {
		type: Array,
		default: () => ["Invoice", "Order", "Quotation"],
	},
	modelValue: {
		type: String,
		default: "Invoice",
	},
});

defineEmits(["update:modelValue"]);
const customerComponent = ref(null);

// Expose focus method for parent
const focusCustomerSearch = () => {
	if (customerComponent.value && typeof customerComponent.value.focusCustomerSearch === "function") {
		customerComponent.value.focusCustomerSearch();
	}
};

const selectFirstCustomer = () => {
	if (customerComponent.value && typeof customerComponent.value.selectFirstCustomer === "function") {
		customerComponent.value.selectFirstCustomer();
	}
};

const openNewCustomer = () => {
	if (customerComponent.value && typeof customerComponent.value.openNewCustomer === "function") {
		customerComponent.value.openNewCustomer();
	}
};

defineExpose({
	focusCustomerSearch,
	selectFirstCustomer,
	openNewCustomer,
});

const frappe = window.frappe;
</script>
