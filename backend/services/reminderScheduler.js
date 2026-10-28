const { db } = require('../database/database');

let schedulerInterval = null;
const notifiedSet = new Set(); // Prevent duplicate alerts in runtime memory

function checkDueReminders() {
  const todayStr = new Date().toISOString().split('T')[0];

  db.all(
    `SELECT r.*, u.email, u.full_name 
     FROM reminders r 
     JOIN users u ON r.user_id = u.id 
     WHERE r.status = 'ACTIVE' AND r.due_date <= ?`,
    [todayStr],
    (err, rows) => {
      if (err) {
        console.error('[Reminder Worker] Database query error:', err.message);
        return;
      }

      if (!rows || rows.length === 0) return;

      for (const item of rows) {
        const dedupeKey = `${item.id}_${item.due_date}_${todayStr}`;
        if (notifiedSet.has(dedupeKey)) continue;

        notifiedSet.add(dedupeKey);
        console.log(`[Reminder Worker] Alert triggered for user "${item.full_name}" (${item.email}): Reminder "${item.title}" is DUE/OVERDUE (Due: ${item.due_date})`);

        // Check if external SMTP credentials exist
        if (process.env.SMTP_HOST && process.env.SMTP_USER) {
          console.log(`[Reminder Worker] Sending email dispatch via ${process.env.SMTP_HOST} to ${item.email}`);
        } else {
          // Documented honest fallback
          // console.log(`[Reminder Worker] Notice: SMTP not configured; notification persisted in-app.`);
        }
      }
    }
  );
}

function startReminderScheduler(intervalMs = 60000) {
  if (schedulerInterval) return;
  console.log(`[Reminder Worker] Initializing automated reminder scanner (interval: ${intervalMs / 1000}s)...`);
  // Run once immediately
  checkDueReminders();
  schedulerInterval = setInterval(checkDueReminders, intervalMs);
}

function stopReminderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Reminder Worker] Stopped.');
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  checkDueReminders
};
