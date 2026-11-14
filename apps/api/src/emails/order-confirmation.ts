import { formatPence } from '@mp/pricing';
import type { OrderView } from '@mp/validation';

// Order confirmation email, sent once payment is confirmed. Plain tables and
// inline styles, because email clients ignore most modern CSS.

const BRAND = { red: '#BF2F21', green: '#28633B', ink: '#151515', cream: '#FBEFD5' };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export interface ConfirmationEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOrderConfirmation(
  order: OrderView,
  options: { trackingUrl: string; shopName: string; timezone: string },
): ConfirmationEmail {
  const delivery = order.fulfilment === 'delivery';
  const when = formatWhen(order.scheduledFor ?? order.estimatedReadyAt, options.timezone);
  const timing = order.scheduledFor
    ? `${delivery ? 'Delivery' : 'Collection'} booked for ${when}`
    : `Estimated ${delivery ? 'delivery' : 'ready to collect'}: ${when}`;
  const address = order.address
    ? [order.address.line1, order.address.line2, order.address.town, order.address.postcode]
        .filter(Boolean)
        .join(', ')
    : null;

  const totals: Array<[string, string]> = [['Subtotal', formatPence(order.subtotalPence)]];
  if (order.discountPence > 0) totals.push(['Discount', `-${formatPence(order.discountPence)}`]);
  if (delivery) totals.push(['Delivery', formatPence(order.deliveryFeePence)]);
  if (order.tipPence > 0) totals.push(['Tip', formatPence(order.tipPence)]);

  // ---- plain text ----
  const text = [
    `Thanks, ${order.customerName}. We have your order #${order.orderNumber}.`,
    '',
    timing,
    ...(address ? [`Delivering to: ${address}`] : []),
    '',
    ...order.items.flatMap((item) => [
      `${item.quantity} x ${item.name} (${item.variantName})  ${formatPence(item.lineTotalPence)}`,
      ...item.options.map((o) => `    + ${o.name}`),
      ...(item.notes ? [`    Note: ${item.notes}`] : []),
    ]),
    '',
    ...totals.map(([label, value]) => `${label}: ${value}`),
    `Total paid: ${formatPence(order.totalPence)}`,
    `Includes VAT of ${formatPence(order.vatPence)}`,
    '',
    `Track your order: ${options.trackingUrl}`,
    '',
    'Food allergy or intolerance? Please contact the shop before your order is prepared.',
    '',
    options.shopName,
  ].join('\n');

  // ---- html ----
  const cell = 'padding:6px 0;font-size:15px;line-height:22px;color:' + BRAND.ink;
  const itemRows = order.items
    .map((item) => {
      const extras = [
        ...item.options.map((o) => `+ ${escapeHtml(o.name)}`),
        ...(item.notes ? [`Note: ${escapeHtml(item.notes)}`] : []),
      ];
      return (
        `<tr><td style="${cell}"><strong>${item.quantity} &times; ${escapeHtml(item.name)}</strong>` +
        ` <span style="color:#555">(${escapeHtml(item.variantName)})</span>` +
        (extras.length
          ? `<br><span style="font-size:13px;color:#555">${extras.join('<br>')}</span>`
          : '') +
        `</td><td align="right" valign="top" style="${cell};white-space:nowrap">${formatPence(item.lineTotalPence)}</td></tr>`
      );
    })
    .join('');
  const totalRows = totals
    .map(
      ([label, value]) =>
        `<tr><td style="${cell};color:#555">${label}</td><td align="right" style="${cell}">${value}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:${BRAND.cream};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
<tr><td style="background:${BRAND.red};border-radius:12px 12px 0 0;padding:20px 24px;color:#ffffff;font-size:22px;font-weight:bold">${escapeHtml(options.shopName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:28px">Thanks, ${escapeHtml(order.customerName)}. Your order is in.</h1>
<p style="margin:0 0 4px;font-size:15px;line-height:22px">Order <strong>#${order.orderNumber}</strong></p>
<p style="margin:0 0 4px;font-size:15px;line-height:22px">${escapeHtml(timing)}</p>
${address ? `<p style="margin:0 0 4px;font-size:15px;line-height:22px">Delivering to: ${escapeHtml(address)}</p>` : ''}
<p style="margin:20px 0"><a href="${escapeHtml(options.trackingUrl)}" style="display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">Track your order</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5">${itemRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e5e5;margin-top:8px">${totalRows}
<tr><td style="${cell};font-size:17px"><strong>Total paid</strong></td><td align="right" style="${cell};font-size:17px"><strong>${formatPence(order.totalPence)}</strong></td></tr>
<tr><td colspan="2" style="padding:0;font-size:13px;color:#555">Includes VAT of ${formatPence(order.vatPence)}</td></tr>
</table>
<p style="margin:20px 0 0;font-size:13px;line-height:19px;color:#555">Food allergy or intolerance? Please contact the shop before your order is prepared.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: `Your ${options.shopName} order #${order.orderNumber}`, html, text };
}
