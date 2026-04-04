# Changelog — OpenDialer

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-01

### Added

- Initial release
- Campaign management (CRUD, caller ID, recording assignment)
- Contact management with CSV bulk import
- Recording upload and management (opener, voicemail)
- Power dialer engine with auto-advance queue
- Answering Machine Detection (AMD) via Telnyx
- Automatic voicemail drop on machine detection
- Pre-recorded opener playback on human detection
- Live human takeover ("Jump In") via WebRTC bridge
- Real-time UI updates via Server-Sent Events (SSE)
- Campaign analytics with CSV export
- Settings page for Telnyx API configuration
- Docker Compose deployment with optional Cloudflare Tunnel
- Telephony provider abstraction (Telnyx implemented, Twilio stubbed)
