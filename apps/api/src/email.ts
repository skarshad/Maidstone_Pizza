// Transactional email. The API talks to this interface; Resend is used when a
// key is configured, otherwise emails are only logged (without their content).

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The same key never sends twice, so a retried job cannot double-send. */
  idempotencyKey: string;
}

export interface EmailSender {
  readonly name: 'resend' | 'log';
  send(message: EmailMessage): Promise<void>;
}

/** Sends through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendSender(config: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailSender {
  const doFetch = config.fetch ?? fetch;
  return {
    name: 'resend',
    async send(message) {
      const response = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!response.ok) {
        // The status is enough to diagnose; the body may echo the recipient.
        throw new Error(`Resend rejected the email (HTTP ${response.status})`);
      }
    },
  };
}

/**
 * Used until a Resend key is configured: records that an email would have gone
 * out. The address is masked and the body is never logged.
 * TODO(credentials): set RESEND_API_KEY and verify the sending domain in Resend.
 */
export function createLogSender(log: (line: string) => void = console.log): EmailSender {
  return {
    name: 'log',
    async send(message) {
      const [local = '', domain = ''] = message.to.split('@');
      log(
        JSON.stringify({
          level: 'info',
          message: 'email not sent: no email provider configured',
          to: `${local.slice(0, 1)}***@${domain}`,
          subject: message.subject,
        }),
      );
    },
  };
}
