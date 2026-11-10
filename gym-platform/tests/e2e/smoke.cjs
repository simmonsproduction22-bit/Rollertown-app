// Demo-mode browser smoke test: public trial booking, owner refund, member booking.
// Run: npm run dev, then BASE_URL=http://localhost:3000 node tests/e2e/smoke.cjs
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const B = process.env.BASE_URL ?? 'http://localhost:3000';
  // 1. Public trial booking with only an email
  await p.goto(B + '/g/demo-mma');
  await p.fill('input[name=name]', 'Casey Two');
  await p.fill('input[name=email]', 'casey.two@example.com');
  await p.check('input[name=waiver]');
  await p.click('text=Book free trial');
  await p.waitForLoadState('networkidle');
  console.log('trial:', (await p.locator('[role=status]').first().textContent().catch(() => 'none')));
  // 2. Owner refunds a payment from a member profile
  await p.context().addCookies([{ name: 'gp_demo_role', value: 'owner', url: B }]);
  await p.goto(B + '/app/members/d0000000-0000-4000-8000-0000000000e1');
  await p.locator('summary:has-text("Refund")').first().click();
  const form = p.locator('form:has(button:has-text("Refund now"))').first();
  await form.locator('input[name=amount]').fill('10.00');
  await form.locator('input[name=reason]').fill('Goodwill credit');
  await form.locator('button:has-text("Refund now")').click();
  await p.waitForLoadState('networkidle');
  console.log('refund:', await p.locator('[role=status]').first().textContent().catch(() => 'none'));
  // 3. Member books a class
  await p.context().clearCookies();
  await p.context().addCookies([{ name: 'gp_demo_role', value: 'member', url: B }]);
  await p.goto(B + '/m/book');
  await p.locator('button:has-text("Book")').first().click();
  await p.waitForLoadState('networkidle');
  console.log('member book:', await p.locator('[role=status]').first().textContent().catch(() => 'none'));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(B + '/m');
  await p.screenshot({ path: 'member-home.png' });
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
