import type { OrderView } from '@mp/validation';

// Short status emails sent as the kitchen moves an order along.

export type NotifiedStatus = 'ACCEPTED' | 'READY' | 'OUT_FOR_DELIVERY' | 'REJECTED';

const BRAND = { red: '#BF2F21', green: '#28633B', ink: '#151515', cream: '#FBEFD5' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function renderOrderStatus(
  order: OrderView,
  status: NotifiedStatus,
  options: { trackingUrl: string; shopName: string; timezone: string; reason: string | null },
): { subject: string; html: string; text: string } {
  const delivery = order.fulfilment === 'delivery';
  const due = timeOf(order.scheduledFor ?? order.estimatedReadyAt, options.timezone);
  const number = `#${order.orderNumber}`;

  let subject: string;
  let lines: string[];
  switch (status) {
    case 'ACCEPTED':
      subject = `We are making your order ${number}`;
      lines = [
        `Good news, ${order.customerName}: the kitchen has accepted your order.`,
        delivery
          ? `It should be with you around ${due}.`
          : `It should be ready to collect around ${due}.`,
      ];
      break;
    case 'READY':
      subject = `Your order ${number} is ready to collect`;
      lines = [`${order.customerName}, your order is ready and waiting for you at the shop.`];
      break;
    case 'OUT_FOR_DELIVERY':
      subject = `Your order ${number} is on its way`;
      lines = [`${order.customerName}, your order has left the shop and is on its way to you.`];
      break;
    case 'REJECTED':
      subject = `Sorry, we could not accept your order ${number}`;
      lines = [
        `Sorry, ${order.customerName}. We were not able to accept your order this time.`,
        ...(options.reason ? [`Reason: ${options.reason}`] : []),
        'Your payment is being refunded in full. It can take a few days to show in your account.',
      ];
      break;
  }

  const text = [...lines, '', `Order details: ${options.trackingUrl}`, '', options.shopName].join(
    '\n',
  );
  const html = `<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="background:${BRAND.red};border-radius:12px 12px 0 0;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:bold">${escapeHtml(options.shopName)}</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:13px;color:#555">Order ${number}</p>
${lines.map((line) => `<p style="margin:0 0 12px;font-size:16px;line-height:24px">${escapeHtml(line)}</p>`).join('\n')}
<p style="margin:20px 0 0"><a href="${escapeHtml(options.trackingUrl)}" style="display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">View your order</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
