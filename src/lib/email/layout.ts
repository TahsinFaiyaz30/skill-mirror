type EmailMessage = {
  category: string;
  title: string;
  preheader: string;
  message: string;
  details?: { label: string; value: string }[];
  action?: { label: string; url: string; showUrl?: boolean };
  code?: string;
  note?: string;
};

const font = "Arial, Helvetica, sans-serif";
const graphite = "#1c1d20";
const cloud = "#f2f4f1";
const yellow = "#ffc928";
const muted = "#55585d";
const border = "#daddd7";

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function renderDetails(details: NonNullable<EmailMessage["details"]>) {
  return `<tr>
    <td style="padding:0 0 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${cloud}" style="table-layout:fixed;background-color:${cloud};border:1px solid ${border};border-radius:10px;">
        ${details
          .map(
            ({ label, value }, index) => `<tr>
          <td width="32%" valign="top" style="padding:12px 8px 12px 16px;${index ? `border-top:1px solid ${border};` : ""}font:400 14px/20px ${font};color:${muted};">
            ${escapeHtml(label)}
          </td>
          <td valign="top" style="padding:12px 16px 12px 0;${index ? `border-top:1px solid ${border};` : ""}font:700 14px/20px ${font};color:${graphite};word-wrap:break-word;overflow-wrap:anywhere;">
            ${escapeHtml(value)}
          </td>
        </tr>`,
          )
          .join("\n        ")}
      </table>
    </td>
  </tr>`;
}

function renderAction({
  label,
  url,
  showUrl,
}: NonNullable<EmailMessage["action"]>) {
  const href = escapeHtml(url);
  const linkCopy = showUrl
    ? `
      <p style="margin:18px 0 0;font:400 13px/20px ${font};color:${muted};">
        If the button doesn’t work, copy this link into your browser.<br>
        <a href="${href}" style="color:#544000;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${href}</a>
      </p>`
    : "";
  return `<tr>
    <td style="padding:0 0 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="${yellow}" style="background-color:${yellow};border-radius:8px;mso-padding-alt:14px 22px;">
            <a href="${href}" style="display:inline-block;padding:14px 22px;border-radius:8px;color:${graphite};font:700 16px/20px ${font};text-decoration:none;mso-padding-alt:0;">
              ${escapeHtml(label)}
            </a>
          </td>
        </tr>
      </table>${linkCopy}
    </td>
  </tr>`;
}

function renderCode(code: string) {
  return `<tr>
    <td style="padding:0 0 26px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" bgcolor="${cloud}" style="padding:12px 20px;background-color:${cloud};border:1px solid ${border};border-radius:8px;color:${graphite};font:700 28px/36px 'Courier New', monospace;letter-spacing:0.1em;">
            ${escapeHtml(code)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function renderEmail(email: EmailMessage) {
  const blocks = [
    email.details?.length ? renderDetails(email.details) : "",
    email.action ? renderAction(email.action) : "",
    email.code ? renderCode(email.code) : "",
    email.note
      ? `<tr>
                  <td style="padding:16px 0 0;border-top:1px solid ${border};color:${muted};font:400 13px/21px ${font};">
                    ${escapeHtml(email.note)}
                  </td>
                </tr>`
      : "",
  ]
    .filter(Boolean)
    .map((block) => "\n                " + block)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(email.title)}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .canvas { padding: 16px 10px !important; }
      .panel { padding-left: 20px !important; padding-right: 20px !important; }
      .headline { font-size: 27px !important; line-height: 33px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${cloud};color:${graphite};font-family:${font};">
  <div aria-hidden="true" style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(email.preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${cloud}" style="background-color:${cloud};">
    <tr>
      <td class="canvas" align="center" style="padding:36px 14px;">
        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${border};border-radius:16px;">
          <tr>
            <td class="panel" bgcolor="${graphite}" style="padding:22px 36px;border-bottom:4px solid ${yellow};border-radius:15px 15px 0 0;background-color:${graphite};color:#ffffff;font:700 24px/30px ${font};letter-spacing:-0.6px;">
              Skill<span style="color:${yellow};">Mirror</span>
            </td>
          </tr>
          <tr>
            <td class="panel" style="padding:30px 36px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout:fixed;">
                <tr>
                  <td style="padding:0 0 10px;color:#745500;font:700 12px/18px ${font};letter-spacing:1.2px;text-transform:uppercase;">
                    ${escapeHtml(email.category)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px;">
                    <h1 class="headline" style="margin:0;color:${graphite};font:700 34px/40px ${font};letter-spacing:-0.8px;overflow-wrap:anywhere;">${escapeHtml(email.title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;color:${muted};font:400 16px/25px ${font};overflow-wrap:anywhere;">
                    ${escapeHtml(email.message)}
                  </td>
                </tr>${blocks}
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>
`;
}
