// Shop details: edit this file to make the site yours.
// Prices are in AZN. Durations are in minutes. Weekdays: 0 = Monday ... 6 = Sunday.

export const SHOP = {
  name: 'Kəsim Barber Co.',
  tagline: 'Sharp cuts, hot towels, no rush.',
  city: 'Baku',
  address: '28 Nizami Street, Baku',
  phone: '+994 50 000 00 00',
  instagram: '@kesim.barber',
  timezone: 'Asia/Baku',
  currency: '₼',
  slotStep: 15, // a booking can start every 15 minutes
  bookDaysAhead: 21,
  // opening hours per weekday, null = closed
  hours: {
    0: ['10:00', '20:00'],
    1: ['10:00', '20:00'],
    2: ['10:00', '20:00'],
    3: ['10:00', '20:00'],
    4: ['10:00', '21:00'],
    5: ['09:00', '18:00'],
    6: null,
  },
};

export const SERVICES = [
  { id: 'cut', name: 'Classic haircut', minutes: 30, price: 20, note: 'Scissors or clipper, washed and styled' },
  { id: 'fade', name: 'Skin fade', minutes: 45, price: 25, note: 'Zero at the sides, blended by hand' },
  { id: 'beard', name: 'Beard trim & shape', minutes: 20, price: 12, note: 'Line-up, oil and balm' },
  { id: 'combo', name: 'Cut + beard', minutes: 60, price: 30, note: 'The full service' },
  { id: 'shave', name: 'Hot towel shave', minutes: 40, price: 22, note: 'Straight razor, two hot towels' },
  { id: 'kids', name: 'Kids cut (under 12)', minutes: 25, price: 14, note: 'Patience included' },
];

export const BARBERS = [
  { id: 'elvin', name: 'Elvin', role: 'Owner · fades', since: 2011, days: [0, 1, 2, 3, 4, 5] },
  { id: 'rauf', name: 'Rauf', role: 'Classic cuts & shaves', since: 2015, days: [0, 1, 3, 4, 5] },
  { id: 'nihad', name: 'Nihad', role: 'Beards & textured hair', since: 2019, days: [1, 2, 3, 4, 5] },
];
