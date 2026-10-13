// EmailJS config — fill these in from your EmailJS dashboard
// (https://dashboard.emailjs.com/admin). Free tier covers low-volume
// sending, enough for OTP + password-reset email for this project. This is
// deliberately independent of Firebase Authentication's own built-in email
// sending, which has a low daily quota on the free "Spark" plan — EmailJS
// has its own separate (and higher) free quota, so the OTP step doesn't
// compete with password-reset emails for the same budget.
//
// Setup (one-time):
// 1. Create a free account at emailjs.com.
// 2. Add an Email Service (Gmail is the easiest — connects your own
//    Gmail account to send through) → copy its Service ID below.
// 3. Create an Email Template for the OTP message. It needs these
//    template variables: {{to_email}}, {{otp_code}}, {{minutes}}.
//    Example body:
//      "Your MDP Modular Systems verification code is {{otp_code}}.
//       It expires in {{minutes}} minutes. If you didn't request this,
//       you can ignore this email."
//    Copy the Template ID below.
// 4. Account → General → copy your Public Key below.
//
// These values are safe to ship in client code — EmailJS public keys are
// meant to be used from the browser (that's the whole point of the
// product) and are scoped per-service/template on their end.

export const EMAILJS_SERVICE_ID = "service_c7esuzn";
export const EMAILJS_OTP_TEMPLATE_ID = "template_qlfmwwq";
export const EMAILJS_PUBLIC_KEY = "yEByKMrphg6bkrxq4";