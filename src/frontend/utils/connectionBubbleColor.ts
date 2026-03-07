import {AlertColor} from "@mui/material";

export function getConnectionBubbleColor(
    alerts: ReadonlyArray<{severity: AlertColor}>,
): string {
    if (alerts.some((alert) => alert.severity === "error")) return "error.main";
    if (alerts.some((alert) => alert.severity === "warning")) return "warning.main";
    return "success.main";
}
