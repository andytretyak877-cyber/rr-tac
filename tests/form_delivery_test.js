const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'main.js'), 'utf8');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function extract(startMarker, endMarker) {
  const start = mainJs.indexOf(startMarker);
  const end = mainJs.indexOf(endMarker, start);
  check(start !== -1 && end !== -1, `Could not extract ${startMarker}`);
  return mainJs.slice(start, end);
}

const leadSource = extract('window.submitLeadForm = async function(form)', 'window.submitMoySkladOrder = async function(form, items)');
const orderSource = extract('window.submitMoySkladOrder = async function(form, items)', "document.addEventListener('DOMContentLoaded'");

async function runLeadCase(emailSucceeds, roistatSucceeds) {
  const calls = [];
  let goals = 0;
  const context = {
    window: {},
    FormData: class FormData {},
    console: { error() {} },
    sendLeadToEmail() {
      calls.push('email');
      return emailSucceeds ? Promise.resolve({ success: true }) : Promise.reject(new Error('email failed'));
    },
    sendLeadToRoistat() {
      calls.push('roistat');
      return roistatSucceeds ? Promise.resolve({ success: true }) : Promise.reject(new Error('roistat failed'));
    },
    reachLeadGoal() {
      goals += 1;
    },
  };
  vm.runInNewContext(leadSource, context);

  let result;
  let error;
  try {
    result = await context.window.submitLeadForm({});
  } catch (caught) {
    error = caught;
  }
  return { calls, goals, result, error };
}

async function runOrderCase(orderSucceeds, roistatSucceeds) {
  const calls = [];
  let goals = 0;
  const context = {
    window: {},
    FormData: class FormData {},
    console: { error() {} },
    sendOrderToBackend() {
      calls.push('order');
      return orderSucceeds ? Promise.resolve({ success: true, order_created: true }) : Promise.reject(new Error('order failed'));
    },
    sendLeadToRoistat() {
      calls.push('roistat');
      return roistatSucceeds ? Promise.resolve({ success: true }) : Promise.reject(new Error('roistat failed'));
    },
    reachLeadGoal() {
      goals += 1;
    },
  };
  vm.runInNewContext(orderSource, context);

  let result;
  let error;
  try {
    result = await context.window.submitMoySkladOrder({}, [{ id: 'rr-test', quantity: 1 }]);
  } catch (caught) {
    error = caught;
  }
  return { calls, goals, result, error };
}

(async () => {
  for (const [email, roistat, expectedSuccess] of [
    [true, true, true],
    [false, true, true],
    [true, false, true],
    [false, false, false],
  ]) {
    const outcome = await runLeadCase(email, roistat);
    check(outcome.calls.join(',') === 'email,roistat', 'Lead transport call order changed');
    check(Boolean(outcome.result) === expectedSuccess, 'SMTP-or-Roistat success semantics changed');
    check(Boolean(outcome.error) === !expectedSuccess, 'Lead failure semantics changed');
    check(outcome.goals === (expectedSuccess ? 1 : 0), 'qleads semantics changed');
  }

  const successfulOrder = await runOrderCase(true, false);
  check(successfulOrder.calls.join(',') === 'order,roistat', 'Order/Roistat call order changed');
  check(Boolean(successfulOrder.result) && !successfulOrder.error, 'Roistat failure cancelled a confirmed order');
  check(successfulOrder.goals === 1, 'Confirmed order did not trigger qleads');

  const failedOrder = await runOrderCase(false, true);
  check(failedOrder.calls.join(',') === 'order,roistat', 'Roistat was not attempted when order failed');
  check(Boolean(failedOrder.error) && !failedOrder.result, 'Failed order was shown as successful');
  check(failedOrder.goals === 0, 'Failed order triggered qleads');

  console.log('Form SMTP/Roistat behavior tests passed.');
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
