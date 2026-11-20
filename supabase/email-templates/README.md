# SkillMirror Supabase Auth emails

Open **Authentication → Email Templates** in your Supabase project. For each template you use, paste the subject from the table and the entire HTML file into the body editor, then save. [Open Supabase Email Templates](https://supabase.com/dashboard/project/_/auth/templates).

| Supabase template | Subject | HTML body |
| --- | --- | --- |
| Confirm sign up | Confirm your email for SkillMirror | [confirm-signup.html](confirm-signup.html) |
| Reset password | Reset your SkillMirror password | [reset-password.html](reset-password.html) |
| Invite user | You’re invited to join SkillMirror | [invite-user.html](invite-user.html) |
| Magic link or OTP | Your SkillMirror sign-in link | [magic-link.html](magic-link.html) |
| Change email address | Confirm your new SkillMirror email address | [change-email.html](change-email.html) |
| Reauthentication | Your SkillMirror verification code | [reauthentication.html](reauthentication.html) |
| Password changed | Your SkillMirror password was changed | [password-changed.html](password-changed.html) |
| Email address changed | Your SkillMirror email address was changed | [email-changed.html](email-changed.html) |
| Phone number changed | Your SkillMirror phone number was changed | [phone-changed.html](phone-changed.html) |
| Sign-in method linked | A sign-in method was linked to SkillMirror | [identity-linked.html](identity-linked.html) |
| Sign-in method removed | A sign-in method was removed from SkillMirror | [identity-unlinked.html](identity-unlinked.html) |
| Verification method added | A verification method was added to SkillMirror | [mfa-factor-enrolled.html](mfa-factor-enrolled.html) |
| Verification method removed | A verification method was removed from SkillMirror | [mfa-factor-unenrolled.html](mfa-factor-unenrolled.html) |

**Confirm sign up** and **Reset password** use SkillMirror’s `/auth/confirm` route. Set the Supabase **Site URL** to the SkillMirror site recipients should open and keep the app’s confirmation URL in the allowed redirects. Paste the placeholders exactly as written. [Supabase email template variables](https://supabase.com/docs/guides/auth/auth-email-templates) · [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

The seven security notifications are sent only when their corresponding Supabase switches are enabled. If the dashboard restricts customization on a new Free project, enable custom SMTP in Supabase Auth. [Supabase template availability](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

The Supabase **Invite user** template creates an account invitation. Candidate interview invitations are sent through Gmail by SkillMirror and use the app’s invitation email template.

To regenerate the HTML after editing the shared email design or Auth copy, run `node scripts/generate-auth-email-templates.mjs` from the project root. Append `--check` to verify that the HTML files match the source.
