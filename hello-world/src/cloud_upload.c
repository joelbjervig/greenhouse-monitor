#include <zephyr/kernel.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>
#include <zephyr/logging/log.h>
#include <modem/modem_key_mgmt.h>
#include <nrf_modem_at.h>
#include <string.h>

#include "cloud_upload.h"

LOG_MODULE_REGISTER(cloud, LOG_LEVEL_INF);

#define TLS_SEC_TAG 42
#define HTTPS_PORT 443
#define HOST "script.google.com"
#define PATH "/macros/s/AKfycbzSCfVOhfDwxb2ymJmoYF-PILGAPOAikMPT1LcVcRXTBFt_Jtv_-9pq1AXAeAg57uWy/exec"

/* Google GTS Root R1 CA certificate (used by script.google.com) */
static const char ca_cert[] =
	"-----BEGIN CERTIFICATE-----\n"
	"MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw\n"
	"CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU\n"
	"MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMDAw\n"
	"MDAwWjBHMQswCQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZp\n"
	"Y2VzIExMQzEUMBIGA1UEAxMLR1RTIFJvb3QgUjEwggIiMA0GCSqGSIb3DQEBAQUA\n"
	"A4ICDwAwggIKAoICAQC2EQKLHuOhd5s73L+UPreVp0A8of2C+X0yBoJx9vaMf/vo\n"
	"27xqLpeXo4xL+Sv2sfnOhB2x+cWX3u+58qPpvBKJXqeqUqv4IyfLpLGcY9vXmX7w\n"
	"Cl7raKb0xlpHDU0QM+NOsROjyBhsS+z8CZDfnWQpJSMHobTSPS5g4M/SCYe7zUjw\n"
	"TcLCeoiKu7rPWRnWr4+wB7CeMfGCwcDfLqZtbBkOtdh+JhpFAz2weaSUKK0Pfybl\n"
	"qAj+lug8aJRT7oM6iCsVlgmy4HqMLnXWnOunVmSPlk9orj2XwoSPwLxAwAtcvfaH\n"
	"szVsrBhQf4TgTM2S0yDpM7xSma8ytSmzJSq0SPly4cpk9+aCEI3oncKKiPo4Zor8\n"
	"Y/kB+Xj9e1x3+naH+uzfsQ55lVe0vSbv1gHR6xYKu44LtcXFilWr06zqkUspzBmk\n"
	"MiVOKvFlRNACzqrOSbTqn3yDsEB750Orp2yjj32JgfpMpf/VjsPOS+C12LOORc92\n"
	"wO1AK/1TD7Cn1TsNsYqiA94xrcx36m97PtbfkSIS5r762DL8EGMUUXLeXdYWk70p\n"
	"aDPvOmbsB4om3xPXV2V4J95eSRQAogB/mqghtqmxlbCluQ0WEdrHbEg8QOB+DVrN\n"
	"VjzRlwW5y0vtOUucxD/SVRNuJLDWcfr0wbrM7Rv1/oFB2ACYPTrIrnqYNxgFlQID\n"
	"AQABo0IwQDAOBgNVHQ8BAf8EBAMCAYYwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4E\n"
	"FgQU5K8rJnEaK0gnhS9SZizv8IkTcT4wDQYJKoZIhvcNAQEMBQADggIBAJ+qQibb\n"
	"C5u+/x6Wki4+omVKapi6Ist9wTrYggoGxval3sBOh2Z5ofmmWJyq+bXmYOfg6LEe\n"
	"QkEzCzc9zolwFcq1JKjPa7XSQCGYzyI0zzvFIoTgxQ6KfF2I5DUkzps+GlQebtuy\n"
	"h6f88/qBVRRiClmpIgUxPoLW7ttXNLwzldMXG+gnoot7TiYaelpkttGsN/H9oPM4\n"
	"7HLwEXWdyzRSjeZ2axfG34arJ45JK3VmgRAhpuo+9K4l/3wV3s6MJT/KYnAK9y8J\n"
	"ZgfIPxz88NtFMN9iiMG1D53Dn0reWVlHxYciNuaCp+0KueIHoI17eko8cdLiA6Ef\n"
	"MgfdG+RCzgwARWGAtQsgWSl4vflVy2PFPEz0tv/bal8xa5meLMFrUKTX5hgUvYU/\n"
	"Z6tGn6D/Qqc6f1zLXbBwHSs09dR2CQzreExZBfMzQsNhFRAbd03OIozUhfJFfbdT\n"
	"6u9AWpQKXCBfTkBdYiJ23//OYb2MI3jSNwLgjt7RETeJ9r/tSQdirpLsQBqvFAnZ\n"
	"0E6yove+7u7Y/9waLd64NnHi/Hm3lCXRSHNboTXns5lndcEZOitHTtNCjv0xyBZm\n"
	"2tIMPNuzjsmhDYAPexZ3FL//2wmUspO8IFgV6dtxQ/PeEMMA3KgqlbbC1j+Qa3bb\n"
	"bP6MvPJwNQzcmRk13NfIRmPVNnGuV/u3gm3c\n"
	"-----END CERTIFICATE-----\n";

int cloud_provision_cert(void)
{
	int err;

	/* Always overwrite to ensure correct cert */
	err = modem_key_mgmt_write(TLS_SEC_TAG,
				   MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
				   ca_cert, sizeof(ca_cert) - 1);
	if (err) {
		LOG_ERR("Failed to provision cert: %d", err);
		return err;
	}

	LOG_INF("TLS cert provisioned (tag %d)", TLS_SEC_TAG);
	return 0;
}

int cloud_read_battery(void)
{
	uint16_t vbat_mv;
	int err = nrf_modem_at_scanf("AT%%XVBAT", "%%XVBAT: %hu", &vbat_mv);
	if (err != 1) {
		LOG_WRN("AT%%XVBAT not supported (modem FW too old?)");
		return -1;
	}

	int percent = (vbat_mv - 3000) * 100 / 1200;
	if (percent > 100) percent = 100;
	if (percent < 0) percent = 0;

	LOG_INF("Battery: %u mV (%d%%)", vbat_mv, percent);
	return percent;
}

int cloud_send_sensor_data(int temp_i, int temp_f,
			   int hum_i, int hum_f,
			   int press_i, int press_f,
			   int gas, int r, int g, int b, int ir_val)
{
	int fd;
	int err;
	char payload[128];
	char request[512];
	char response[256];

	/* Format JSON payload */
	int plen = snprintf(payload, sizeof(payload),
		"{\"temp\":%d.%02d,\"hum\":%d.%02d,\"press\":%d.%02d,"
		"\"gas\":%d,\"r\":%d,\"g\":%d,\"b\":%d,\"ir\":%d}",
		temp_i, temp_f, hum_i, hum_f, press_i, press_f,
		gas, r, g, b, ir_val);

	/* Create TLS socket */
	fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TLS_1_2);
	if (fd < 0) {
		LOG_ERR("Socket create failed: %d", errno);
		return -errno;
	}

	/* Set socket timeouts (30s send, 30s receive) */
	struct timeval timeout = { .tv_sec = 30, .tv_usec = 0 };
	setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
	setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));

	/* Set TLS options */
	sec_tag_t sec_tag_list[] = { TLS_SEC_TAG };
	err = setsockopt(fd, SOL_TLS, TLS_SEC_TAG_LIST,
			 sec_tag_list, sizeof(sec_tag_list));
	if (err) {
		LOG_ERR("TLS sec tag failed: %d", errno);
		close(fd);
		return -errno;
	}

	err = setsockopt(fd, SOL_TLS, TLS_HOSTNAME, HOST, strlen(HOST));
	if (err) {
		LOG_ERR("TLS hostname failed: %d", errno);
		close(fd);
		return -errno;
	}

	/* Resolve and connect */
	struct addrinfo hints = {
		.ai_family = AF_INET,
		.ai_socktype = SOCK_STREAM,
	};
	struct addrinfo *addr;

	err = getaddrinfo(HOST, "443", &hints, &addr);
	if (err) {
		LOG_ERR("DNS resolve failed: %d", err);
		close(fd);
		return -1;
	}

	err = connect(fd, addr->ai_addr, addr->ai_addrlen);
	freeaddrinfo(addr);
	if (err) {
		LOG_ERR("Connect failed: %d", errno);
		close(fd);
		return -errno;
	}

	/* Build HTTP POST request */
	int rlen = snprintf(request, sizeof(request),
		"POST %s HTTP/1.1\r\n"
		"Host: %s\r\n"
		"Content-Type: application/json\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		PATH, HOST, plen, payload);

	/* Send */
	err = send(fd, request, rlen, 0);
	if (err < 0) {
		LOG_ERR("Send failed: %d", errno);
		close(fd);
		return -errno;
	}

	/* Read response (just check status) */
	int bytes = recv(fd, response, sizeof(response) - 1, 0);
	if (bytes > 0) {
		response[bytes] = '\0';
		/* Check for 200 OK or 302 redirect (both mean success for Apps Script) */
		if (strstr(response, "200") || strstr(response, "302")) {
			LOG_INF("Cloud upload OK");
		} else {
			LOG_WRN("Cloud response: %.40s", response);
		}
	}

	close(fd);
	return 0;
}
