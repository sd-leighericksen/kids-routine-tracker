import { db } from './db.js';
import { runMigrations } from './migrations.js';

runMigrations();

const existing = db.prepare('SELECT COUNT(*) AS n FROM children').get() as {
  n: number;
};
if (existing.n > 0) {
  console.log(
    `Seed skipped: ${existing.n} children already exist. Delete backend/data/app.db to re-seed.`,
  );
  process.exit(0);
}

const CHILDREN = ['Alex', 'Ben', 'Cara', 'Dani', 'Ezra'] as const;

const BLOCKS = [
  { name: 'Morning', deadline_time: '08:30' },
  { name: 'Afternoon', deadline_time: '17:30' },
] as const;

const TASKS = [
  { name: 'Brush teeth', emoji: '🪥' },
  { name: 'Get dressed', emoji: '👕' },
  { name: 'Make bed', emoji: '🛏️' },
  { name: 'Eat breakfast', emoji: '🥣' },
  { name: 'Pack school bag', emoji: '🎒' },
  { name: 'Tidy room', emoji: '🧹' },
  { name: 'Homework', emoji: '📚' },
  { name: 'Shower', emoji: '🚿' },
] as const;

const insertChild = db.prepare(
  'INSERT INTO children (name, display_order) VALUES (?, ?)',
);
const insertBlock = db.prepare(
  'INSERT INTO blocks (name, deadline_time, display_order) VALUES (?, ?, ?)',
);
const insertTask = db.prepare('INSERT INTO tasks (name, emoji) VALUES (?, ?)');
const insertAssignment = db.prepare(
  'INSERT INTO assignments (block_id, child_id, task_id, display_order) VALUES (?, ?, ?, ?)',
);

const tx = db.transaction(() => {
  const childIds: Record<string, number> = {};
  CHILDREN.forEach((name, idx) => {
    const res = insertChild.run(name, idx);
    childIds[name] = Number(res.lastInsertRowid);
  });

  const blockIds: Record<string, number> = {};
  BLOCKS.forEach((b, idx) => {
    const res = insertBlock.run(b.name, b.deadline_time, idx);
    blockIds[b.name] = Number(res.lastInsertRowid);
  });

  const taskIds: Record<string, number> = {};
  TASKS.forEach((t) => {
    const res = insertTask.run(t.name, t.emoji);
    taskIds[t.name] = Number(res.lastInsertRowid);
  });

  // Morning: all kids share the basics
  const morningShared = [
    'Brush teeth',
    'Get dressed',
    'Make bed',
    'Eat breakfast',
    'Pack school bag',
  ];
  for (const child of CHILDREN) {
    morningShared.forEach((task, idx) => {
      insertAssignment.run(
        blockIds['Morning'],
        childIds[child],
        taskIds[task],
        idx,
      );
    });
  }

  // Afternoon: tidy room + shower shared, homework only for older three.
  const afternoonShared = ['Tidy room', 'Shower'];
  const afternoonHomework = ['Alex', 'Ben', 'Cara'];
  for (const child of CHILDREN) {
    afternoonShared.forEach((task, idx) => {
      insertAssignment.run(
        blockIds['Afternoon'],
        childIds[child],
        taskIds[task],
        idx,
      );
    });
    if (afternoonHomework.includes(child)) {
      insertAssignment.run(
        blockIds['Afternoon'],
        childIds[child],
        taskIds['Homework'],
        99,
      );
    }
  }
});

tx();

const counts = {
  children: (db.prepare('SELECT COUNT(*) AS n FROM children').get() as { n: number }).n,
  blocks: (db.prepare('SELECT COUNT(*) AS n FROM blocks').get() as { n: number }).n,
  tasks: (db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n,
  assignments: (db.prepare('SELECT COUNT(*) AS n FROM assignments').get() as { n: number }).n,
};

console.log('Seed complete:', counts);
