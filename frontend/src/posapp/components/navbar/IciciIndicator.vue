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
				{{ connectivityLabel }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

defineOptions({
	name: "FsIndicator",
});

interface Props {
	enableIciciPayments?: boolean;
	networkOnline?: boolean;
	iciciOnline?: boolean;
	serverConnecting?: boolean;
	isIpHost?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	enableIciciPayments: false,
	networkOnline: false,
	iciciOnline: false,
	serverConnecting: false,
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
	if (DEBUG) {
		console.log(
			"ICICI StatusIndicator - Network:",
			props.networkOnline,
			"Remote ICICI Server:",
			props.iciciOnline,
			"Connecting:",
			props.serverConnecting,
			"Local IP Host:",
			props.isIpHost,
			"Host:",
			window.location.hostname,
		);
	}

	if (!props.enableIciciPayments) return "grey";

	// Show yellow/orange when connecting
	if (props.serverConnecting) {
		return "orange";
	}

	// For IP hosts (localhost, 127.0.0.1, IP addresses), prioritize network status
	if (props.isIpHost) {
		return props.networkOnline ? "green" : "red";
	}

	// For domain hosts, require both network and server connectivity
	if (props.networkOnline && props.iciciOnline) {
		return "green";
	}

	// Network online but server offline
	if (props.networkOnline && !props.iciciOnline) {
		return "orange";
	}

	// Network offline
	return "red";
});

const statusIcon = computed(() => {
	/**
	 * Determines the Material Design Icon to display based on network and server status.
	 * @returns {string} A Material Design Icon class string.
	 */
	if (DEBUG) {
		console.log(
			"ICICI StatusIndicator - Determining icon for network:",
			props.networkOnline,
			"Remote ICICI server:",
			props.iciciOnline,
			"connecting:",
			props.serverConnecting,
		);
	}

	if (!props.enableIciciPayments) return "mdi-bank-off";

	// Show loading icon when connecting
	if (props.serverConnecting) {
		return "mdi-sync";
	}

	// For IP hosts, show based on network status
	if (props.isIpHost) {
		return props.networkOnline ? "mdi-bank" : "mdi-network-off";
	}

	// Full connectivity
	if (props.networkOnline && props.iciciOnline) {
		return "mdi-bank-check";
	}

	// Network online but server issues
	if (props.networkOnline && !props.iciciOnline) {
		return "mdi-bank-off-outline";
	}

	// Network offline
	return "mdi-network-off";
});

const statusText = computed(() => {
	/**
	 * Provides a descriptive text for the tooltip that appears when hovering over the status icon.
	 * This text is also used for the `title` attribute of the button.
	 * @returns {string} A localized status message.
	 */
	const hostname = window.location.hostname;
	const hostType = props.isIpHost ? "Local/IP Host" : "Domain Host";

	if (!props.enableIciciPayments) return __(`ICICI Payments not enabled`);

	if (props.serverConnecting) {
		return __(`Connecting to ICICI server... (${hostType}: ${hostname})`);
	}

	if (!props.networkOnline) {
		return __(`No Internet Connection (${hostType}: ${hostname})`);
	}

	if (props.isIpHost) {
		return __(`Connected to ${hostname}`);
	}

	if (props.iciciOnline) {
		return __(`Connected to Remote ICICI Server`);
	}

	return __(`Remote ICICI Server Offline; local server: (${hostname})`);
});

const connectivityLabel = computed(() => {
	/**
	 * Short, user-friendly connectivity label for the navbar.
	 * @returns {string}
	 */

	 if (!props.enableIciciPayments) return __(`ICICI not enabled`);

	 if (props.serverConnecting) {
		return __("ICICI Connecting");
	}

	if (!props.networkOnline) {
		return __("ICICI Offline");
	}

	if (props.networkOnline && props.iciciOnline) {
		return __("ICICI Online");
	}

	// Network is available but server is not responding
	return __("ICICI Limited");
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
