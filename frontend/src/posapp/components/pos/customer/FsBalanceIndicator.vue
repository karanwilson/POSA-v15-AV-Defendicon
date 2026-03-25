<template>
	<div class="status-section-enhanced mx-1">
		<v-btn icon :title="statusText" :aria-label="statusText" class="status-btn-enhanced" :color="statusColor">
			<v-icon :color="statusColor">{{ statusIcon }}</v-icon>
		</v-btn>
		<div class="status-info-always-visible">
			<div
				class="status-title-inline"
				:class="{
					'status-connected': statusColor === 'green',
					'status-offline': statusColor === 'red',
				}"
			>
				<!-- {{ connectivityLabel }} -->
				FS Balance
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({
	name: "FsBalanceIndicator",
});

interface Props {
	networkOnline?: boolean;
	fs_balance_available?: string;
	fs_balance_message?: string;
	customer: string;
	//serverConnecting?: boolean;
	isIpHost?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	networkOnline: false,
	fs_balance_available: "",
	fs_balance_message: "",
	customer: "",
	//serverConnecting: false,
	isIpHost: false,
});

// @ts-ignore
const __ = (window as any).__ || ((text: string) => text);
const DEBUG = false;

const statusColor = computed(() => {
	/**
	 * Determines the color of the status icon based on current network and server connectivity.
	 * @returns {string} A Vuetify color string ('green', 'red').
	 */

	let fs_balance_available_float: any;
	if (props.fs_balance_available)
		fs_balance_available_float = parseFloat(props.fs_balance_available);
	console.log("props.fs_balance_available: ", props.fs_balance_available);
	console.log("fs_balance_available_float: ", fs_balance_available_float);
	console.log("props.customer: ", props.customer);
	console.log("Test Message");

	if (DEBUG) {
		console.log(
			// "FS BalanceIndicator - Network:",
			props.networkOnline,
			"FS Balance Available:",
			//props.fs_balance_available,
			// "Connecting:",
			// props.serverConnecting,
			// "Local IP Host:",
			// props.isIpHost,
			"Host:",
			window.location.hostname,
		);
	}

	// Show yellow/orange when connecting
	// if (props.serverConnecting) {
	// 	return "orange";
	// }

	if (props.customer && fs_balance_available_float >= 0) {
		return fs_balance_available_float > 0 ? "green" : "red"; // FS Balance positive or zero
	}

	// Invalid FS Balance
	if (props.customer && fs_balance_available_float < 0) {
		return "grey";
	}

	// Remote FS server not reachable
	if (props.customer && !fs_balance_available_float) {
		return "orange";
	}

	// For IP hosts (localhost, 127.0.0.1, IP addresses), prioritize network status
	if (props.isIpHost) {
		return props.networkOnline ? "green" : "red";
	}

	// Network offline or no FS balance response
	else return "grey";
});

const statusIcon = computed(() => {
	/**
	 * Determines the Material Design Icon to display based on network and server status.
	 * @returns {string} A Material Design Icon class string.
	 */
	if (DEBUG) {
		console.log(
			"FS StatusIndicator - Determining icon for network:",
			props.networkOnline,
			"Remote FS server:",
			//props.fs_balance_available,
			// "connecting:",
			// props.serverConnecting,
		);
	}

	// Show loading icon when connecting
	// if (props.serverConnecting) {
	// 	return "mdi-wifi-sync";
	// }

	// For IP hosts, show based on network status
	if (props.isIpHost) {
		return props.networkOnline ? "mdi-wifi" : "mdi-wifi-off";
	}

	// Full connectivity
	// if (props.customer && props.fs_balance_available) {
	// 	return "mdi-bank";
	// }

	// Network online but server issues
	if (props.customer && !props.fs_balance_available) {
		return "mdi-bank-off";
	}

	// Network offline: color should be orange
	// Customer not selected: color should be grey
	return "mdi-bank";
});

const statusText = computed(() => {
	/**
	 * Provides a descriptive text for the tooltip that appears when hovering over the status icon.
	 * This text is also used for the `title` attribute of the button.
	 * @returns {string} A localized status message.
	 */
	const hostname = window.location.hostname;
	const hostType = props.isIpHost ? "Local/IP Host" : "Domain Host";

	// if (props.serverConnecting) {
	// 	return __(`Connecting to FS server... (${hostType}: ${hostname})`);
	// }

	if (!props.networkOnline) {
		return __(`No Internet Connection (${hostType}: ${hostname})`);
	}

	if (!props.customer) {
		return __(`No Customer selected`);
	}

	if (props.isIpHost) {
		return __(`Connected to ${hostname}`);
	}

	if (!props.fs_balance_available) return __(props.fs_balance_message);

	else if (props.fs_balance_available) {
		return __(`Connected to Remote FS Server`);
	}

	else return __(`Remote FS Server Offline; local server: (${hostname})`);
});

const connectivityLabel = computed(() => {
// 	/**
// 	 * Short, user-friendly connectivity label for the navbar.
// 	 * @returns {string}
// 	 */
	// if (props.serverConnecting) {
	// 	return __("FS Connecting");
	// }

	if (!props.networkOnline) {
		return __("FS Offline");
	}

	if (props.networkOnline && props.fs_balance_available) {
		return __("FS Online");
	}

	// Network is available but server is not responding
	return __("FS Limited");
	});
</script>

<style scoped>
/* Enhanced Status Section */
.status-section-enhanced {
	display: flex;
	align-items: center;
	gap: 8px;
	/* Reduced gap */
	margin-right: 8px;
	/* Reduced margin */
}

.status-btn-enhanced {
	background: var(--pos-hover-bg) !important;
	border: 1px solid var(--pos-border);
	transition: all 0.3s ease;
	padding: 4px;
	/* Reduced padding */
}

.status-btn-enhanced:hover {
	background: var(--pos-focus-bg) !important;
	transform: scale(1.05);
}

.status-info-always-visible {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	min-width: 120px;
}

.status-title-inline {
	font-size: 12px;
	font-weight: 600;
	line-height: 1.2;
	transition: color 0.3s ease;
}

.status-title-inline.status-connected {
	color: #4caf50;
}

.status-title-inline.status-offline {
	color: #f44336;
}

.status-section-enhanced .status-info-always-visible {
	min-width: unset;
}
</style>
