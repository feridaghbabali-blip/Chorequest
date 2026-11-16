// Sample family used on first run (shared by the server and the artifact build).
export const MEMBERS = [
  { key: 'leyla', name: 'Leyla', avatar: '🦄', color: '#FF4FA3', role: 'kid', goal: ['Bicycle', '🚲', 6000], split: { spend: 50, save: 30, give: 20 } },
  { key: 'murad', name: 'Murad', avatar: '🦖', color: '#16C47F', role: 'teen', goal: ['Headphones', '🎧', 4500], split: { spend: 60, save: 30, give: 10 } },
  { key: 'nigar', name: 'Nigar', avatar: '🦊', color: '#FF8A00', role: 'kid', goal: ['Art set', '🎨', 2500], split: { spend: 40, save: 40, give: 20 } },
];

export const CHORES = [
  { title: 'Make your bed', icon: '🛏️', price: 50, who: 'leyla', repeat: 'daily' },
  { title: 'Tidy your toys', icon: '🧸', price: 50, who: 'nigar', repeat: 'daily' },
  { title: 'Feed the cat', icon: '🐱', price: 30, who: null, repeat: 'daily' },
  { title: 'Set the table', icon: '🍽️', price: 40, who: 'murad', repeat: 'daily' },
  { title: 'Take out the trash', icon: '🗑️', price: 100, who: 'murad', repeat: 'weekdays', weekdays: [0, 2, 4] },
  { title: 'Water the plants', icon: '🪴', price: 60, who: null, repeat: 'weekly' },
  { title: 'Vacuum the living room', icon: '🧹', price: 150, who: 'murad', repeat: 'weekly' },
  { title: 'Wash the car', icon: '🚗', price: 500, who: null, repeat: 'once', bonus: true },
  { title: 'Clean the balcony', icon: '🧽', price: 400, who: null, repeat: 'once', bonus: true },
];
