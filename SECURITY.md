# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported |
| ------- | --------- |
| 1.0.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

We take the security of Tallr seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Please do NOT:
- Open a public GitHub issue
- Disclose the vulnerability publicly before a fix is available

### Please DO:
- Report via GitHub Security Advisories: https://github.com/kaihochak/tallr/security/advisories/new
- Include detailed steps to reproduce the vulnerability
- Allow us reasonable time to respond and fix the issue before public disclosure

### What to expect:
- **Initial Response**: Within 48 hours (UTC)
- **Status Update**: Within 5 business days (Mon-Fri, UTC)
- **Resolution Timeline**: Based on severity (see Security Updates section below)

## Security Considerations

### Data Privacy
- Tallr runs entirely locally on your machine
- No user data or code is sent to external servers
- Session metadata stays on your device
- Authentication tokens are stored in local files (`~/Library/Application Support/Tallr/auth.token`)

### Local HTTP Server
- The HTTP gateway runs on `127.0.0.1:4317` (localhost only)
- Cannot be accessed from external networks
- **Requires** bearer token authentication for all API requests
- All endpoints return 401 Unauthorized without valid token
- CORS restricted to specific origins (Tauri app + dev server)

### Environment Variables
Authentication token hierarchy (in order of priority):
1. `TALLR_TOKEN`: Custom token (highest priority)
2. `SWITCHBOARD_TOKEN`: Legacy token name (fallback)
3. Auto-generated file-based token (default)

**Security Notes**:
- Tokens are required (not optional) for API access
- Never commit tokens or secrets to version control
- Auto-generated tokens are created on first app launch

### CLI Wrapper Security
- The CLI wrapper monitors output but doesn't execute commands
- It passes through all arguments to the underlying CLI tools
- No code interpretation or execution happens within Tallr

### Shell Command Security
- IDE commands (cursor, code) restricted to safe file paths only
- OSAScript commands limited to Terminal directory changes
- Regex validators prevent command injection attacks
- Path arguments must match `^[a-zA-Z0-9/_. -]+$` pattern

### Development vs Production
- Debug endpoints (`/v1/debug/*`) only available in development builds
- Production builds return 404 for debug routes
- Development mode indicated by compile-time flags

## Best Practices for Users

1. **Custom Tokens (Optional)**: Set `TALLR_TOKEN` for custom authentication (auto-generated tokens work fine for most users)
2. **Keep Updated**: Install security updates promptly  
3. **Secure Your System**: Tallr's security depends on your system security (file permissions matter)
4. **Monitor Logs**: Check `~/Library/Application Support/Tallr/logs/` for unusual activity
5. **Report Issues**: Contact us if you notice unusual behavior

## Vulnerability Disclosure Process

1. **Report** the vulnerability via GitHub Security Advisories
2. **Confirmation** from our team within 48 hours
3. **Investigation** and verification of the issue
4. **Fix Development** based on severity
5. **Testing** the fix thoroughly
6. **Release** security update
7. **Announcement** after users have had time to update
8. **Credit** given to reporter (if desired)

## Security Updates

Security updates are released based on CVSS severity:
- **Critical (9.0-10.0)**: Immediate patch release
- **High (7.0-8.9)**: Within 7 days
- **Medium (4.0-6.9)**: Within 30 days
- **Low (0.1-3.9)**: In the next regular release

Subscribe to security announcements:
- Watch the repository for Security Advisories
- Monitor release notes with [SECURITY] tag

## Scope

This security policy covers:
- The Tallr desktop application
- CLI wrapper functionality  
- Local HTTP gateway (port 4317)

Out of scope:
- Third-party AI services (Claude, Gemini, etc.)
- Operating system vulnerabilities
- Network infrastructure outside localhost

## Safe Harbor

We support responsible disclosure and will not pursue legal action against researchers who:
- Report vulnerabilities through the proper channels
- Avoid privacy violations and data destruction
- Give us reasonable time to respond before public disclosure

## Contact

For security concerns:
- Use GitHub Security Advisories: https://github.com/kaihochak/tallr/security/advisories/new
- Or contact the maintainer via GitHub: @kaihochak

For general issues, use GitHub Issues.

Thank you for helping keep Tallr secure!