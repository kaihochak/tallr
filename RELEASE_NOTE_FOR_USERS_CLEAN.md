# Tallr v0.1.1 is Here - CLI Issue Fixed!

Hey Tallr users! We've just released **v0.1.1** that fixes the frustrating authentication error many of you encountered.

## What's Fixed?

**THE PROBLEM**: Getting this error when running `tallr claude`?
```
Error: Authentication required. Please start the Tallr application first.
```

**THE FIX**: **It's now resolved!** The CLI will work immediately after starting Tallr.

## How to Update

**Super quick - just 3 steps:**

1. **Download the new version**: [Click here to download Tallr v0.1.1](https://github.com/kaihochak/tallr/releases/download/v0.1.1/Tallr_0.1.1_aarch64.dmg)

2. **Replace your old version**:
   ```bash
   # Close Tallr first
   pkill -f Tallr
   
   # Remove old version
   rm -rf /Applications/Tallr.app
   
   # Install from the new DMG you downloaded
   ```

3. **Launch and test**:
   - Start Tallr from Applications
   - Run `tallr claude` in Terminal
   - It should work immediately!

## What Changed Under the Hood?

We fixed a timing issue where the authentication system wasn't ready when you tried to use the CLI. Now the authentication is set up immediately when Tallr starts.

## Need Help?

- **Still having issues?** Open an issue on [GitHub](https://github.com/kaihochak/tallr/issues)
- **Questions?** Check out the [documentation](https://github.com/kaihochak/tallr#readme)

---

**Download now**: [Tallr_v0.1.1_aarch64.dmg](https://github.com/kaihochak/tallr/releases/download/v0.1.1/Tallr_0.1.1_aarch64.dmg) (5.8MB)

Thanks for using Tallr!