# Security Policy — OpenDialer

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in OpenDialer, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email the maintainers directly or use GitHub's private vulnerability reporting feature.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** as soon as possible based on severity

## Security Considerations

OpenDialer is designed to be self-hosted. Keep the following in mind:

- **API Keys:** Telnyx credentials are stored in your `.env` file and in the SQLite database (settings table). Ensure your deployment environment is secured.
- **No Authentication:** OpenDialer does not currently include user authentication. It is intended to run on private networks or behind a reverse proxy with auth.
- **Webhook Endpoint:** The `/webhooks/telnyx` endpoint is publicly accessible by design (Telnyx needs to reach it). Consider validating webhook signatures in production.
- **File Uploads:** Recording uploads are stored on the local filesystem. Ensure the `uploads/` directory has appropriate permissions.
- **SQLite:** The database file should not be publicly accessible. Docker volumes handle this by default.
