#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/logging/log.h>
#include <modem/lte_lc.h>
#include <modem/nrf_modem_lib.h>
#include <nrf_modem_at.h>

#include "cloud_upload.h"

LOG_MODULE_REGISTER(greenhouse, LOG_LEVEL_INF);

#define SAMPLE_INTERVAL_MS 5000
#define CLOUD_SEND_EVERY  12  /* Send to cloud every 12 samples (60s) */
#define LTE_RECONNECT_DELAY_MS 10000  /* Wait 10s before reconnect attempt */

static const struct device *bme680;
static const struct device *bh1749;
static volatile bool lte_connected;

K_SEM_DEFINE(lte_connected_sem, 0, 1);

static void lte_handler(const struct lte_lc_evt *const evt)
{
	switch (evt->type) {
	case LTE_LC_EVT_NW_REG_STATUS:
		if (evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_HOME) {
			LOG_INF("LTE: Connected (home)");
			lte_connected = true;
			k_sem_give(&lte_connected_sem);
		} else if (evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_ROAMING) {
			LOG_INF("LTE: Connected (roaming)");
			lte_connected = true;
			k_sem_give(&lte_connected_sem);
		} else if (evt->nw_reg_status == LTE_LC_NW_REG_SEARCHING) {
			LOG_INF("LTE: Searching...");
			lte_connected = false;
		} else if (evt->nw_reg_status == LTE_LC_NW_REG_NOT_REGISTERED) {
			LOG_WRN("LTE: Deregistered");
			lte_connected = false;
		}
		break;
	case LTE_LC_EVT_CELL_UPDATE:
		LOG_INF("LTE: Cell ID: %d, Tracking area: %d",
			evt->cell.id, evt->cell.tac);
		break;
	default:
		break;
	}
}

static int lte_reconnect(void)
{
	int err;

	LOG_INF("LTE: Attempting reconnect...");
	k_sem_reset(&lte_connected_sem);

	err = lte_lc_connect_async(lte_handler);
	if (err) {
		LOG_ERR("LTE reconnect request failed: %d", err);
		return err;
	}

	/* Wait up to 120s for reconnection */
	if (k_sem_take(&lte_connected_sem, K_SECONDS(120)) != 0) {
		LOG_ERR("LTE: Reconnect timed out");
		return -ETIMEDOUT;
	}

	LOG_INF("LTE: Reconnected");
	return 0;
}

static void read_sensors_csv(int sample)
{
	struct sensor_value temp, hum, press, gas;
	struct sensor_value r, g, b, ir;
	int temp_i = 0, temp_f = 0;
	int hum_i = 0, hum_f = 0;
	int press_i = 0, press_f = 0;
	int gas_val = 0, r_val = 0, g_val = 0, b_val = 0, ir_val = 0;

	if (device_is_ready(bme680)) {
		sensor_sample_fetch(bme680);
		sensor_channel_get(bme680, SENSOR_CHAN_AMBIENT_TEMP, &temp);
		sensor_channel_get(bme680, SENSOR_CHAN_HUMIDITY, &hum);
		sensor_channel_get(bme680, SENSOR_CHAN_PRESS, &press);
		sensor_channel_get(bme680, SENSOR_CHAN_GAS_RES, &gas);
		temp_i = temp.val1;
		temp_f = temp.val2 / 10000; /* 2 decimal places */
		hum_i = hum.val1;
		hum_f = hum.val2 / 10000;
		press_i = press.val1;
		press_f = press.val2 / 10000;
		gas_val = gas.val1;
	}

	if (device_is_ready(bh1749)) {
		sensor_sample_fetch(bh1749);
		sensor_channel_get(bh1749, SENSOR_CHAN_RED, &r);
		sensor_channel_get(bh1749, SENSOR_CHAN_GREEN, &g);
		sensor_channel_get(bh1749, SENSOR_CHAN_BLUE, &b);
		sensor_channel_get(bh1749, SENSOR_CHAN_IR, &ir);
		r_val = r.val1;
		g_val = g.val1;
		b_val = b.val1;
		ir_val = ir.val1;
	}

	/* Use uptime as timestamp (ms since boot) */
	int64_t ts = k_uptime_get();

	printk("%lld,%d,%d.%02d,%d.%02d,%d.%02d,%d,%d,%d,%d,%d\n",
	       ts, sample, temp_i, temp_f, hum_i, hum_f, press_i, press_f,
	       gas_val, r_val, g_val, b_val, ir_val);

	/* Send to Google Sheets every CLOUD_SEND_EVERY samples */
	if (sample % CLOUD_SEND_EVERY == 0) {
		if (!lte_connected) {
			LOG_WRN("LTE not connected, attempting reconnect");
			lte_reconnect();
		}
		if (lte_connected) {
			int ret = cloud_send_sensor_data(temp_i, temp_f, hum_i, hum_f,
					       press_i, press_f, gas_val,
					       r_val, g_val, b_val, ir_val);
			if (ret < 0) {
				LOG_WRN("Cloud upload failed (%d), will retry next cycle", ret);
				lte_connected = false;
			}
		}
	}
}

int main(void)
{
	int err;
	int sample = 0;

	printk("=== Greenhouse Sensor Hub ===\n\n");

	/* Initialize modem */
	printk("Initializing modem...\n");
	err = nrf_modem_lib_init();
	if (err) {
		printk("Modem init failed: %d\n", err);
		return -1;
	}

	/* Provision TLS cert for Google Sheets */
	cloud_provision_cert();

	/* Query modem firmware version */
	char response[64];
	err = nrf_modem_at_cmd(response, sizeof(response), "AT+CGMR");
	if (!err) {
		printk("Modem FW: %s", response);
	}

	/* Connect to LTE */
	printk("Connecting to LTE (this may take 30-60s)...\n");
	err = lte_lc_connect_async(lte_handler);
	if (err) {
		printk("LTE connect failed: %d\n", err);
		return -1;
	}

	/* Wait for network registration (up to 120s) */
	if (k_sem_take(&lte_connected_sem, K_SECONDS(120)) != 0) {
		printk("LTE: Initial connection timed out, continuing anyway...\n");
	} else {
		lte_connected = true;
		printk("LTE connected!\n\n");
	}

	/* Initialize sensors */
	bme680 = DEVICE_DT_GET_ANY(bosch_bme680);
	bh1749 = DEVICE_DT_GET_ANY(rohm_bh1749);

	printk("Sensors:\n");
	printk("  BME680 (env):   %s\n", device_is_ready(bme680) ? "ready" : "NOT FOUND");
	printk("  BH1749 (light): %s\n", device_is_ready(bh1749) ? "ready" : "NOT FOUND");
	printk("\n");

	/* Main sensor loop — CSV output */
	printk("uptime_ms,sample,temp_c,humidity_pct,pressure_kpa,gas_ohm,red,green,blue,ir\n");
	while (1) {
		sample++;
		read_sensors_csv(sample);
		k_msleep(SAMPLE_INTERVAL_MS);
	}

	return 0;
}
