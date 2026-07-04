#ifndef CLOUD_UPLOAD_H
#define CLOUD_UPLOAD_H

/**
 * Provision the TLS certificate for Google into the modem.
 * Call once after modem init, before LTE connect.
 */
int cloud_provision_cert(void);

/**
 * Read battery voltage and return percentage (0-100).
 * Returns -1 on failure (e.g., modem FW too old).
 */
int cloud_read_battery(void);

/**
 * Send sensor data to Google Sheets via Apps Script webhook.
 * Returns 0 on success, negative on error.
 */
int cloud_send_sensor_data(int temp_i, int temp_f,
			   int hum_i, int hum_f,
			   int press_i, int press_f,
			   int gas, int r, int g, int b, int ir_val);

#endif /* CLOUD_UPLOAD_H */
