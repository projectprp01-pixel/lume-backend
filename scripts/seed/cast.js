/**
 * The cast: every stay in the seed, as pure data. This file is the SINGLE SOURCE OF TRUTH for
 * which guest stays when, in which rooms, and what they booked — stays.js turns each entry into
 * documents in every collection, all keyed by the ONE Booking ID the stay is given there.
 *
 * Nothing in here has a booking ID written by hand. IDs are assigned in stays.js (ordered by
 * arrival date) so there is no way for two files to disagree about a guest's ID.
 *
 * Day offsets are relative to the day the seed runs (0 = today), so the demo always has guests
 * arriving today, checking out today/tomorrow, in-house, upcoming, and recently departed.
 *
 * Fields
 *   key        short handle used by REQUESTS below
 *   name       primary guest / booking name (Booking.primaryGuestName — what every hub shows)
 *   others     the other guests, in order (Check-in Hub shows them by name)
 *   kids       how many of the guests are children
 *   cc         country code (default +91)
 *   arr, n     arrival day offset, nights (checkout = arr + n)
 *   rooms      room per booked room; a leading "~" means "type booked, number not assigned yet"
 *   ci         Check-in Hub ID state, one char per guest: A approved, S submitted (awaiting
 *              review), R rejected, - not submitted. 'all' = every guest approved.
 *   co         late-checkout time override ("HH:MM") — CheckoutFolio.checkoutTimeOverride
 *   items      hub bookings: E experience, S spa, T transport, D dining (builders below)
 *   fb         in-room dining orders: F(day, hour, dishes, opts)
 *   manual     extra folio charges not tied to a hub booking: [name, price, paid]
 *   rv         review left after checkout: [rating, text, googleClicked, recoveryResponse, hoursAfter]
 */

// ---- item builders ---------------------------------------------------------
// d = day of the stay (0 = arrival day). Options: g guests, paid (default: true for the guest
// app, false for staff-entered), s 'staff' | 'app', x true = cancelled, slot = time-slot index,
// addons = names, city (transport p2p), dur (spa duration index).
export const E = (key, d, o = {}) => ({ kind: 'exp', key, d, ...o });
export const S = (key, d, o = {}) => ({ kind: 'spa', key, d, ...o });
export const T = (slot, vehicle, d, o = {}) => ({ kind: 'trn', slot, vehicle, d, ...o });
export const D = (key, d, o = {}) => ({ kind: 'din', key, d, ...o });
export const F = (d, hour, dishes, o = {}) => ({ d, hour, dishes, ...o });

const GENERIC_FAMILY = (n) => Array.from({ length: n }, (_, i) => `Guest ${i + 2}`);

export const STAYS = [
  // ============================ Recently departed (each left a review) ============================
  { key: 'khan', name: 'Yusuf & Aaliyah Khan', others: ['Aaliyah Khan'], arr: -36, n: 2, rooms: ['Villa 3'], ci: 'all',
    items: [E('coracle', 1, { g: 2 }), D('riverside', 1, { g: 2, addons: ['Live acoustic musician'] }), S('couples', 1)],
    rv: [4, 'Great value stay with wonderful staff. Would have loved a later checkout.', true] },
  { key: 'pillai', name: 'The Pillai Family', others: ['Radha Pillai', 'Master Kiran Pillai', 'Anika Pillai'], kids: 2, arr: -31, n: 4, rooms: ['Machaan 1'], ci: 'all',
    items: [E('kidswalk', 1, { g: 4 }), E('coffeetasting', 2, { g: 2 }), D('verandah', 2, { g: 4 }), T(1, 'innova', 3)],
    fb: [F(1, 13, ['Paneer Butter Masala', 'Vegetable Biryani'])],
    rv: [3, 'Nice property, but our machaan had a lot of insects and the housekeeping was slow to respond.', false] },
  { key: 'kowalski', name: 'Marta Kowalski', cc: '+48', arr: -24, n: 3, rooms: ['Cottage 106'], ci: 'all',
    items: [E('plantation', 1, { g: 1 }), S('facial', 1), D('verandah', 2, { g: 1 }), T(2, 'sedan', 3, { city: 'Mysuru' })],
    fb: [F(1, 20, ['Coorg Garden Salad', 'Estate Filter Coffee'])],
    rv: [5, 'A perfect solo retreat. Quiet, beautiful and the food was outstanding.', false] },
  { key: 'sethi', name: 'Rahul & Ananya Sethi', others: ['Ananya Sethi'], arr: -19, n: 3, rooms: ['Villa 6'], ci: 'all',
    items: [E('pottery', 1, { g: 2 }), E('etrails', 2, { g: 2, addons: ['Photography package'] }), D('verandah', 1, { g: 2 }), S('abhyanga', 2, { g: 2 })],
    rv: [4, 'Lovely cottage, attentive staff. The plantation walk with the naturalist was a highlight.', true] },
  { key: 'bansal', name: 'Sunita Bansal', arr: -14, n: 2, rooms: ['Cottage 102'], ci: 'all',
    items: [S('abhyanga', 1, { addons: ['Herbal steam bath'] }), S('kati', 1, { x: true }), E('meditation', 1, { g: 1 })],
    fb: [F(1, 9, ['Idli Sambar', 'Estate Filter Coffee'])],
    rv: [2, 'Billing dispute at checkout — we were charged for a spa session we had cancelled. Still unresolved.', false,
      'Cancelled sessions should be removed from the bill automatically, and someone should have called back the same day.'] },
  { key: 'marshall', name: 'Ethan & Chloe Marshall', others: ['Chloe Marshall'], cc: '+1', arr: -13, n: 4, rooms: ['Pool Villa 2'], ci: 'all',
    items: [E('abbey', 1, { g: 2 }), E('photoshoot', 2), S('couples', 2), D('deck', 3, { g: 2, addons: ['Wine pairing'] }), T(3, 'innova', 0)],
    fb: [F(2, 20, ['Pandi Curry', 'Akki Roti with Chutney'])],
    rv: [5, 'Exceptional hospitality from the front desk team, especially during our late arrival.', true] },
  { key: 'gupta', name: 'The Gupta Family', others: ['Neeta Gupta', 'Aarav Gupta', 'Ira Gupta'], kids: 2, arr: -11, n: 5, rooms: ['Cottage 111'], ci: 'all',
    items: [E('kidswalk', 1, { g: 4 }), E('coracle', 2, { g: 4 }), E('culturalshow', 3, { g: 4 }), D('grill', 3, { g: 4 }), T(1, 'innova', 4)],
    fb: [F(2, 13, ['Veg Spring Rolls', 'Watermelon Cooler']), F(3, 20, ['Vegetable Biryani', 'Gulab Jamun'])],
    rv: [3, 'The kids enjoyed the property but the pool water was quite cold in the mornings.', false] },
  { key: 'deshmukh', name: 'Priya Deshmukh', arr: -6, n: 2, rooms: ['Villa 1'], ci: 'all',
    items: [S('kati', 1), E('bylakuppe', 1, { g: 1 }), T(2, 'innova', 2, { city: 'Bengaluru' })],
    rv: [4, 'Wonderful experience overall, the transport desk was very responsive for our Coorg tour.', false] },
  { key: 'iyengar', name: 'Lakshmi & Ravi Iyengar', others: ['Ravi Iyengar'], arr: -6, n: 3, rooms: ['Pool Villa 3'], ci: 'all',
    items: [S('couples', 1), D('riverside', 2, { g: 2 }), E('coracle', 1, { g: 2 })],
    fb: [F(1, 21, ['Bamboo Shoot Pork Fry', 'Gulab Jamun'])],
    rv: [5, "Best resort we have stayed at in India. The spa couple's ritual was unforgettable.", true] },
  { key: 'nair2', name: 'Arjun & Sneha Nair', others: ['Sneha Nair'], arr: -4, n: 3, rooms: ['Pool Villa 1'], ci: 'all',
    items: [D('deck', 1, { g: 2, addons: ['Photography package', 'Wine pairing'] }), S('couples', 1), E('photoshoot', 2)],
    fb: [F(2, 8, ['Classic Eggs Benedict', 'Fresh Orange Juice'])],
    rv: [5, 'Absolutely stunning property. The pool villa was private and quiet, and the team went out of their way for our honeymoon dinner.', true] },
  { key: 'cohen', name: 'David Cohen', cc: '+1', arr: -4, n: 3, rooms: ['Cottage 104'], ci: 'all',
    items: [E('bylakuppe', 1, { g: 1 }), S('facial', 2)],
    fb: [F(1, 20, ['Pandi Curry', 'Akki Roti with Chutney']), F(2, 20, ['Kori Gassi', 'Vegetable Biryani'])],
    rv: [3, 'Good food and a beautiful setting, but the in-room dining took over an hour to arrive both nights.', false] },
  { key: 'kulkarni', name: 'The Kulkarni Family', others: ['Sunil Kulkarni', 'Mihir Kulkarni', 'Anvi Kulkarni'], kids: 2, arr: -5, n: 4, rooms: ['Cottage 109'], ci: 'all',
    items: [E('kidswalk', 1, { g: 4 }), D('verandah', 1, { g: 4 })],
    fb: [F(2, 13, ['Veg Spring Rolls', 'Watermelon Cooler'])],
    rv: [1, 'Room was not ready at check-in despite confirmation and we waited almost two hours in the lobby with tired kids.', false,
      'Having the room ready at the confirmed time, or at least a welcome drink and a quiet place to wait, would have changed the whole start of our stay.'] },
  { key: 'rossi', name: 'Helena Rossi', cc: '+39', arr: -3, n: 2, rooms: ['Cottage 103'], ci: 'all',
    items: [E('coffeetasting', 0, { g: 1 }), E('plantation', 1, { g: 1 }), D('verandah', 1, { g: 1 })],
    fb: [F(1, 9, ['Masala Dosa', 'Estate Filter Coffee'])],
    rv: [4, 'Great coffee plantation views and a lovely cottage. Breakfast could have more variety.', false] },
  { key: 'sheikh2', name: 'Imran & Zoya Sheikh', others: ['Zoya Sheikh'], arr: -3, n: 2, rooms: ['Villa 5'], ci: 'all',
    items: [E('etrails', 1, { g: 2 }), S('abhyanga', 1, { g: 2 })],
    fb: [F(1, 8, ['Buttermilk Pancakes', 'Hot Chocolate'])],
    rv: [4, 'Peaceful stay, loved the nature trail experience. Wifi was a bit patchy in the room.', true] },

  // ============================ Checking out TODAY (Checkout hub → Today) ============================
  { key: 'sharma', name: 'Rohit & Meera Sharma', others: ['Meera Sharma'], arr: -4, n: 4, rooms: ['Cottage 112'], ci: 'all',
    items: [E('coracle', 1, { g: 2, paid: true }), D('riverside', 3, { g: 2, paid: true }), S('couples', 2, { s: 'staff', paid: false })],
    fb: [F(2, 20, ['Pandi Curry', 'Paneer Butter Masala'], { paid: false })],
    rv: [5, 'The lakeside dinner on our anniversary was the highlight of the trip — the staff remembered without us asking twice. Would come back purely for that evening.', true, '', 1] },
  { key: 'kapoor', name: 'Neha Kapoor', arr: -2, n: 2, rooms: ['Villa 4'], ci: 'all', co: '10:30',
    items: [S('abhyanga', 1, { g: 1, addons: ['Scalp & hair oil treatment'], paid: true })],
    fb: [F(1, 9, ['Fresh Fruit Bowl', 'Estate Filter Coffee'], { paid: true })] },
  { key: 'iyer', name: 'The Iyer Family', others: ['Lakshmi Iyer', 'Ramesh Iyer', 'Master Vihaan Iyer'], kids: 2, arr: -5, n: 5, rooms: ['Cottage 108'], ci: 'all', co: '12:00',
    items: [E('kidswalk', 2, { g: 4, x: true }), E('kidswalk', 3, { g: 4, s: 'staff', paid: false }), D('grill', 3, { g: 4, s: 'staff', paid: false }), T(1, 'innova', 4, { s: 'staff', paid: false })],
    fb: [F(3, 13, ['Kori Gassi', 'Vegetable Biryani', 'Gulab Jamun'], { paid: false })],
    rv: [2, "Kids' activity was cancelled with no notice and no alternative offered. Disappointing for a trip we'd built around it.", false,
      'A heads-up the evening before and a swap to the pottery workshop would have saved the day for the kids.', 1] },
  { key: 'malhotra', name: 'Karan Malhotra', arr: -3, n: 3, rooms: ['Villa 7'], ci: 'all', co: '13:30',
    items: [S('kati', 1, { paid: true }), T(2, 'sedan', 3, { city: 'Bengaluru', s: 'staff', paid: false })],
    fb: [F(1, 13, ['Bamboo Shoot Pork Fry', 'Masala Peanuts & Banana Chips'], { paid: false }), F(2, 20, ['Kori Gassi'], { paid: false })],
    rv: [3, 'Room was lovely but the spa booking process felt disorganised — had to follow up twice to confirm my slot.', false, '', 1] },
  { key: 'reddy', name: 'Divya Reddy', arr: -2, n: 2, rooms: ['Cottage 105'], ci: 'all', co: '11:30',
    items: [S('abhyanga', 1, { paid: true })],
    fb: [F(1, 9, ['Classic Omelette', 'Masala Chai'], { paid: true })] },
  { key: 'bhat', name: 'Anita & Vikram Bhat', others: ['Vikram Bhat'], arr: -3, n: 3, rooms: ['Villa 2'], ci: 'all', co: '15:00',
    items: [E('coracle', 1, { g: 2, paid: true }), D('deck', 2, { g: 2, paid: true })],
    manual: [['Late check-out fee', 4200, false]] },
  { key: 'kumar', name: 'Sanjay Kumar', arr: -1, n: 1, rooms: ['Cottage 101'], ci: 'all', co: '09:00',
    items: [],
    fb: [F(0, 21, ['Vegetable Biryani', 'Masala Chai'], { paid: true })] },

  // ============================ Checking out TOMORROW ============================
  { key: 'bhatia', name: 'Pooja & Aman Bhatia', others: ['Aman Bhatia'], arr: -2, n: 3, rooms: ['Pool Villa 2'], ci: 'all',
    items: [S('couples', 1, { s: 'staff', paid: false }), E('etrails', 2, { g: 2, paid: true })],
    fb: [F(1, 20, ['Chicken Sukka Skewers', 'Watermelon Cooler'], { paid: false })] },
  { key: 'weber', name: 'Thomas Weber', cc: '+49', arr: -1, n: 2, rooms: ['Cottage 110'], ci: 'all',
    items: [E('plantation', 1, { g: 1 })],
    fb: [F(0, 20, ['Penne Arrabbiata', 'Coorg Garden Salad'], { paid: true })] },
  { key: 'menon', name: 'The Menon Family', others: ['Sudha Menon', 'Gautham Menon', 'Ishita Menon', 'Master Rohan Menon'], kids: 2, arr: -3, n: 4, rooms: ['Machaan 3'], ci: 'all',
    items: [E('kidswalk', 1, { g: 5, paid: true }), E('abbey', 2, { g: 3, s: 'staff', paid: false }), D('verandah', 2, { g: 5, s: 'staff', paid: false }), D('grill', 3, { g: 5, s: 'staff', paid: false })],
    fb: [F(2, 13, ['Veg Spring Rolls', 'Fresh Orange Juice', 'Gulab Jamun'], { paid: false })] },

  // ============================ In-house (staying past tomorrow) ============================
  { key: 'rao_honey', name: 'Siddharth & Kavya Rao', others: ['Kavya Rao'], arr: -3, n: 6, rooms: ['River View Cottage 1'], ci: 'all',
    items: [D('riverside', 1, { g: 2 }), S('couples', 2, { paid: true }), E('photoshoot', 3, { s: 'staff', paid: false }), E('coracle', 4, { g: 2 })],
    fb: [F(2, 8, ['Classic Eggs Benedict', 'Fresh Orange Juice'], { paid: false }), F(3, 8, ['Masala Dosa', 'Estate Filter Coffee'], { paid: false })] },
  { key: 'pai', name: 'Dr. Ramesh Pai', arr: -2, n: 3, rooms: ['Villa 9'], ci: 'all',
    items: [S('kati', 1, { paid: true }), S('abhyanga', 2, { s: 'staff', paid: false })],
    fb: [F(1, 13, ['Paneer Tikka', 'Tomato Basil Soup'], { paid: false })] },
  { key: 'bhattacharya', name: 'The Bhattacharya Family', others: ['Sourav Bhattacharya', 'Mitali Bhattacharya', 'Ishani Bhattacharya', 'Master Rian Bhattacharya'], kids: 2, arr: -2, n: 5, rooms: ['Pool Villa 4', 'Coffee Cottage 101'], ci: 'all',
    items: [E('kidswalk', 1, { g: 5 }), E('pottery', 2, { g: 3 }), D('deck', 3, { g: 2 }), S('couples', 3)],
    fb: [F(1, 13, ['Pandi Curry', 'Vegetable Biryani'], { paid: false }), F(2, 8, ['Buttermilk Pancakes', 'Masala Chai'], { paid: false }), F(2, 0, ['Idli Sambar', 'Masala Chai'], { paid: false, ago: 45 })] },
  { key: 'verma', name: 'Verma Family Reunion', others: ['Ritu Verma', 'Kabir Verma', 'Ishaan Verma', 'Meenal Verma', 'Master Dev Verma', 'Tara Verma', 'Anil Verma'], kids: 2, arr: -1, n: 4, rooms: ['Machaan 4', 'The Nest 1'], ci: 'all',
    items: [E('plantation', 1, { g: 8 }), E('etrails', 2, { g: 6 }), D('grill', 2, { g: 8 }), S('yoga', 2, { g: 4 }), T(1, 'tempo', 3)],
    fb: [F(0, 21, ['Chicken Sukka Skewers', 'Paneer Tikka', 'Watermelon Cooler'], { paid: false }), F(1, 0, ['Masala Dosa', 'Akki Roti with Chutney', 'Estate Filter Coffee'], { paid: false, ago: 2 })] },
  { key: 'whitfield', name: 'James Whitfield', cc: '+44', arr: -1, n: 3, rooms: ['Pool Villa 3'], ci: 'all',
    items: [S('abhyanga', 1, { g: 1, s: 'staff', paid: false }), E('coffeetasting', 2, { g: 1 })],
    fb: [F(0, 20, ['Kori Gassi', 'Vegetable Biryani'], { paid: false }), F(1, 0, ['Classic Omelette', 'Masala Chai'], { paid: false, ago: 27 })] },
  { key: 'farah', name: 'Farah Sheikh', arr: -1, n: 4, rooms: ['Lily Pool Cottage 2'], ci: 'all',
    items: [S('facial', 1, { paid: true }), S('yoga', 2), E('meditation', 2, { g: 1 })],
    fb: [F(0, 21, ['Chicken Sukka Skewers', 'Watermelon Cooler'], { paid: false }), F(1, 0, ['Fresh Fruit Bowl', 'Estate Filter Coffee'], { paid: false, ago: 9 })] },

  // ============================ Arriving TODAY (Check-in hub → Today) ============================
  { key: 'nair', name: 'The Nair Family', others: ['Anitha Nair', 'Ravi Nair', 'Master Dev Nair'], kids: 2, arr: 0, n: 3, rooms: ['Villa 8'], ci: 'RRRR',
    rej: ['ID photo is upside down — please re-upload.', 'Document is expired.', 'Name on ID does not match booking name.', 'Only a partial scan was uploaded.'],
    items: [E('kidswalk', 1, { g: 4 }), D('verandah', 1, { g: 4 }), T(2, 'innova', 0, { city: 'Bengaluru' })] },
  { key: 'rao', name: 'Ananya & Vikram Rao', others: ['Vikram Rao'], arr: 0, n: 2, rooms: ['Coffee Cottage 108'], ci: 'all',
    items: [D('deck', 1, { g: 2 }), E('coracle', 1, { g: 2 })] },
  { key: 'nambiar', name: 'Deepika Nambiar', arr: 0, n: 1, rooms: ['~Cottage'], ci: '-',
    items: [S('yoga', 1, { paid: false })] },
  { key: 'solanki', name: 'Kabir & Meera Solanki', others: ['Meera Solanki'], arr: 0, n: 3, rooms: ['Cottage 107', 'Villa 6'], ci: 'all',
    items: [S('couples', 1), E('etrails', 2, { g: 2 }), T(1, 'sedan', 1)] },
  { key: 'chawla', name: 'Vivek Chawla', arr: 0, n: 2, rooms: ['Cottage 109'], ci: 'S',
    items: [E('bylakuppe', 1, { g: 1 })] },

  // ============================ Upcoming ============================
  { key: 'singh', name: 'Rashmi Singh', arr: 1, n: 2, rooms: ['Lily Pool Cottage 1'], ci: 'S',
    items: [S('facial', 1)] },
  { key: 'paranthaman', name: 'Harini Paranthaman', arr: 2, n: 3, rooms: ['~Cottage'], ci: '-',
    items: [E('meditation', 1, { g: 1 }), S('abhyanga', 2, { paid: false })] },
  { key: 'shetty', name: 'Vikram Shetty', arr: 3, n: 2, rooms: ['Villa 3'], ci: '-', cancelled: true,
    items: [D('chefs', 1, { g: 2, x: true }), S('couples', 1, { x: true }), E('coracle', 1, { g: 2, x: true })] },
  { key: 'malhotraext', name: 'The Malhotra Extended Family',
    others: ['Sunita Malhotra', 'Vikram Malhotra', 'Anjali Malhotra', 'Rohan Malhotra', 'Priya Malhotra', 'Master Aryan Malhotra', 'Deepak Malhotra', 'Nisha Malhotra', 'Karthik Malhotra'],
    kids: 3, arr: 4, n: 6, rooms: ['Pool Villa 2', 'Lily Pool Cottage 1', 'River View Cottage 1', 'Villa 7', 'Machaan 1'], ci: 'AAAAASAAAA',
    items: [E('plantation', 1, { g: 10 }), E('bylakuppe', 2, { g: 6 }), E('abbey', 3, { g: 6 }), D('grill', 2, { g: 10 }), S('yoga', 2, { g: 6 }), T(1, 'tempo', 2), T(2, 'tempo', 0, { city: 'Bengaluru' })] },
  { key: 'reddyfam', name: 'The Reddy Family', others: ['Anand Reddy', 'Swathi Reddy', 'Master Arnav Reddy', 'Diya Reddy'], kids: 2, arr: 5, n: 4, rooms: ['Pool Villa 6', '~Coffee Cottage'], ci: 'AAARA',
    rej: ['Back of the ID was not included — please upload both sides.'],
    items: [E('kidswalk', 1, { g: 5 }), D('verandah', 1, { g: 5 }), T(2, 'innova', 0, { city: 'Mysuru' })] },
  { key: 'chatterjee', name: 'The Chatterjee Reunion', others: ['Ritwik Chatterjee', 'Sohini Chatterjee', 'Abir Chatterjee', 'Tanmay Chatterjee', 'Rupa Chatterjee'], arr: 6, n: 5,
    rooms: ['Machaan 2', 'The Nest 1', 'River View Cottage 2'], ci: 'AASS--',
    items: [E('coffeetasting', 1, { g: 6 }), D('riverside', 2, { g: 2 }), S('yoga', 1, { g: 6 }), T(2, 'tempo', 0, { city: 'Bengaluru' })] },
  { key: 'santhosh', name: 'Santhosh Kumar', arr: 7, n: 3, rooms: ['Cottage 103'], ci: 'all',
    items: [E('pottery', 1, { g: 1 }), S('abhyanga', 1)] },
  { key: 'agarwal', name: 'Pranjul Agarwal', arr: 9, n: 2, rooms: ['Villa 4'], ci: '-',
    items: [E('etrails', 1, { g: 1 })] },
  { key: 'maradugu', name: 'Reshma Maradugu', arr: 10, n: 4, rooms: ['Villa 2'], ci: '-',
    items: [S('kati', 1)] },
  { key: 'parsana', name: 'Dishit & Kavita Parsana', others: ['Kavita Parsana'], arr: 12, n: 3, rooms: ['Coffee Cottage 104'], ci: 'A-',
    items: [D('deck', 1, { g: 2 }), S('couples', 2)] },
  { key: 'tantia', name: 'Yash Tantia', arr: 14, n: 2, rooms: ['~Villa'], ci: '-', items: [] },
];

// ---- Guest requests (Requests Hub). Every one belongs to a stay by key → carries its Booking ID.
// when: { ago } minutes before now, or { d, h } = d days from today at hour h.
// by: staff key (see people.js) who accepted it; doneAfter: minutes from placing to completing.
export const REQUESTS = [
  { stay: 'sharma', item: 'Room decoration for our anniversary — flowers and candles please', category: 'Special occasions', dept: 'Concierge', status: 'Completed', when: { d: -3, h: 10 }, by: 'concierge.manager', doneAfter: 200, source: 'App', priority: 'High', ai: 90, reason: 'Occasion decoration falls under Concierge.' },
  { stay: 'sharma', item: 'Two extra towels for the bath', category: 'Housekeeping', dept: 'Housekeeping', status: 'Completed', when: { d: -2, h: 18 }, by: 'housekeeping.staff', doneAfter: 20, source: 'Chat', ai: 96, reason: 'Towels are a Housekeeping task.' },
  { stay: 'iyer', item: 'Baby cot for the room', category: 'Baby & kids', dept: 'Housekeeping', status: 'Completed', when: { d: -5, h: 15 }, by: 'housekeeping.manager', doneAfter: 45, source: 'App', ai: 88, reason: 'Cots are set up by Housekeeping.' },
  { stay: 'iyer', item: 'Laundry pickup — 6 items, wash and fold', category: 'Laundry', dept: 'Laundry', status: 'Assigned', when: { ago: 90 }, by: 'laundry.manager', source: 'Chat', ai: 97, reason: 'Laundry pickup.' },
  { stay: 'kumar', item: 'Could we have a late check-out until 12?', category: 'General', dept: 'Front Desk', status: 'Pending', when: { ago: 45 }, source: 'Chat', ai: 72, reason: 'Check-out changes go to the Front Desk.' },
  { stay: 'malhotra', item: 'The AC in the room is making a rattling noise', category: 'Housekeeping', dept: 'Maintenance', status: 'In-progress', when: { ago: 200 }, by: 'maintenance.staff', source: 'Phone Call', priority: 'High', ai: 93, reason: 'Faulty fixture — Maintenance.' },
  { stay: 'bhatia', item: 'Bottled water and an ice bucket refill', category: 'Refreshments', dept: 'Housekeeping', status: 'Completed', when: { d: -1, h: 19 }, by: 'housekeeping.staff', doneAfter: 15, source: 'Chat', ai: 85, reason: 'In-room refreshments restock.' },
  { stay: 'menon', item: 'Airport drop tomorrow at 6 am for 5 people', category: 'Transport', dept: 'Transport', status: 'Assigned', when: { ago: 120 }, by: 'transport.manager', source: 'App', ai: 98, reason: 'Airport transfer.' },
  { stay: 'menon', item: 'An extra bed for a child, please', category: 'Housekeeping', dept: 'Housekeeping', status: 'Pending', when: { ago: 20 }, source: 'Chat', ai: 90, reason: 'Extra beds are set up by Housekeeping.' },
  { stay: 'verma', item: 'Room cleaning and turndown service', category: 'Housekeeping', dept: 'Housekeeping', status: 'Completed', when: { d: -1, h: 17 }, by: 'housekeeping.staff', doneAfter: 60, source: 'App', ai: 99, reason: 'Turndown service.' },
  { stay: 'verma', item: 'A 1 kg celebration cake for a birthday tomorrow evening', category: 'Special occasions', dept: 'Concierge', status: 'Pending', when: { ago: 35 }, source: 'App', priority: 'High', manual: true },
  { stay: 'whitfield', item: 'Wash & fold laundry, about 4 kg', category: 'Laundry', dept: 'Laundry', status: 'Completed', when: { d: -1, h: 16 }, by: 'laundry.manager', doneAfter: 600, source: 'Chat', ai: 97, reason: 'Laundry pickup.' },
  { stay: 'bhattacharya', item: 'A cab to Madikeri town this afternoon', category: 'Transport', dept: 'Transport', status: 'Assigned', when: { ago: 150 }, by: 'transport.staff', source: 'Chat', ai: 94, reason: 'Local cab booking.' },
  { stay: 'farah', item: 'A yoga mat for the room', category: 'Housekeeping', dept: 'Housekeeping', status: 'Pending', when: { ago: 12 }, source: 'Chat', ai: 60, reason: 'Room amenity request.' },
  { stay: 'rao_honey', item: 'A flower arrangement on the bed tonight', category: 'Special occasions', dept: 'Concierge', status: 'Completed', when: { d: -2, h: 14 }, by: 'concierge.staff', doneAfter: 150, source: 'App', ai: 89, reason: 'Occasion set-up.' },
  { stay: 'pai', item: 'The tap in the bathroom is leaking', category: 'Housekeeping', dept: 'Maintenance', status: 'Completed', when: { d: -1, h: 9 }, by: 'maintenance.staff', doneAfter: 75, source: 'Phone Call', ai: 95, reason: 'Leaking tap — Maintenance.' },
  { stay: 'kulkarni', item: 'Our room is not ready and we have been waiting in the lobby', category: 'General', dept: 'Front Desk', status: 'Completed', when: { d: -5, h: 14 }, by: 'frontdesk.manager', doneAfter: 110, source: 'Phone Call', priority: 'High', ai: 80, reason: 'Arrival issue — Front Desk.' },
  { stay: 'cohen', item: 'Our in-room dinner order is very late', category: 'General', dept: 'F & B', status: 'Completed', when: { d: -3, h: 21 }, by: 'fnb.manager', doneAfter: 40, source: 'Phone Call', priority: 'High', ai: 92, reason: 'Room-service delay — F & B.' },
  { stay: 'gupta', item: 'The pool water is too cold in the morning', category: 'General', dept: 'Maintenance', status: 'Completed', when: { d: -9, h: 8 }, by: 'maintenance.manager', doneAfter: 120, source: 'Chat', ai: 70, reason: 'Pool heating — Maintenance.' },
  { stay: 'weber', item: 'Please restock the tea and coffee sachets', category: 'Refreshments', dept: 'Housekeeping', status: 'Pending', when: { ago: 30 }, source: 'Chat', ai: 95, reason: 'In-room restock.' },
  { stay: 'kapoor', item: 'Can my spa session move 30 minutes later?', category: 'General', dept: 'Spa & Wellness', status: 'Completed', when: { d: -1, h: 12 }, by: 'spa.staff', doneAfter: 25, source: 'Chat', ai: 96, reason: 'Spa schedule change.' },
  { stay: 'rossi', item: 'An ice bucket refill please', category: 'Refreshments', dept: 'Housekeeping', status: 'Completed', when: { d: -2, h: 20 }, by: 'housekeeping.staff', doneAfter: 12, source: 'Chat', ai: 97, reason: 'Ice refill.' },
];

export { GENERIC_FAMILY };
