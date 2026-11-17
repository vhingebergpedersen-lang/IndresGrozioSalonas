/* Demo data: a fictional municipality west of Copenhagen.
   All citizens, phone numbers and companies are made up. */

function makeDemo() {
  const rnd = seeded(20261117);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  const operators = [
    { id: 'o1', name: 'Nordlys Taxa ApS', contact: 'Driftsleder Jan · 43 11 22 33', address: 'Sydvestvej 50, 2600 Glostrup', lat: 55.6600, lng: 12.4050 },
    { id: 'o2', name: 'Lift & Bus Vest ApS', contact: 'Disponent Lise · 43 44 55 66', address: 'Park Allé 290, 2605 Brøndby', lat: 55.6505, lng: 12.4230 },
    { id: 'o3', name: 'Engvejens Minibusser', contact: 'Ejer Henrik · 36 77 88 99', address: 'Islevdalvej 140, 2610 Rødovre', lat: 55.6930, lng: 12.4420 },
  ];

  const vehicles = [
    { id: 'v1', operatorId: 'o1', name: 'Taxa 101', type: 'Taxa', seats: 4, wc: 0, driver: 'Ole Bach', phone: '21 10 10 01', start: '06:30', end: '17:00', active: true, color: '#2563eb' },
    { id: 'v2', operatorId: 'o1', name: 'Taxa 102', type: 'Taxa', seats: 4, wc: 0, driver: 'Hanne Lund', phone: '21 10 10 02', start: '06:30', end: '17:00', active: true, color: '#0891b2' },
    { id: 'v3', operatorId: 'o1', name: 'Taxa 103', type: 'Taxa', seats: 4, wc: 0, driver: 'Ali Yilmaz', phone: '21 10 10 03', start: '07:00', end: '17:00', active: true, color: '#7c3aed' },
    { id: 'v4', operatorId: 'o2', name: 'Liftbus 11', type: 'Liftbus', seats: 5, wc: 2, driver: 'Kim Holm', phone: '22 20 20 11', start: '06:30', end: '17:00', active: true, color: '#dc2626' },
    { id: 'v5', operatorId: 'o2', name: 'Liftbus 12', type: 'Liftbus', seats: 5, wc: 2, driver: 'Susanne Friis', phone: '22 20 20 12', start: '06:30', end: '17:00', active: true, color: '#ea580c' },
    { id: 'v6', operatorId: 'o2', name: 'Liftbus 14', type: 'Liftbus', seats: 4, wc: 3, driver: 'Peter Dahl', phone: '22 20 20 14', start: '07:00', end: '17:00', active: true, color: '#b45309' },
    { id: 'v7', operatorId: 'o3', name: 'Minibus 21', type: 'Minibus', seats: 8, wc: 1, driver: 'Mette Bro', phone: '23 30 30 21', start: '06:30', end: '17:00', active: true, color: '#16a34a' },
    { id: 'v8', operatorId: 'o3', name: 'Minibus 22', type: 'Minibus', seats: 8, wc: 1, driver: 'Rasmus Krog', phone: '23 30 30 22', start: '06:30', end: '17:00', active: true, color: '#65a30d' },
    { id: 'v9', operatorId: 'o3', name: 'Minibus 23', type: 'Minibus', seats: 8, wc: 0, driver: 'Fatima Saleh', phone: '23 30 30 23', start: '07:00', end: '17:00', active: true, color: '#db2777' },
  ];

  const institutions = [
    { id: 'i1', name: 'Vestskolen (specialskole)', type: 'Skole', address: 'Tårnvej 200, 2610 Rødovre', lat: 55.6835, lng: 12.4380, open: '08:00', close: '14:00', contact: 'Kontoret · 36 37 00 00' },
    { id: 'i2', name: 'Dagcenter Solbakken', type: 'Dagcenter', address: 'Hvidovrevej 300, 2650 Hvidovre', lat: 55.6450, lng: 12.4720, open: '09:30', close: '15:00', contact: 'Leder Birgit · 36 39 00 00' },
    { id: 'i3', name: 'Aktivitetscenter Engen', type: 'Aktivitetstilbud', address: 'Roskildevej 500, 2620 Albertslund', lat: 55.6560, lng: 12.3600, open: '09:00', close: '15:30', contact: 'Personalestue · 43 68 00 00' },
    { id: 'i4', name: 'Træningscenter Vest', type: 'Genoptræning', address: 'Hovedvejen 120, 2600 Glostrup', lat: 55.6640, lng: 12.3960, open: '10:00', close: '12:00', contact: 'Reception · 43 23 00 00' },
    { id: 'i5', name: 'Hvidovre Hospital', type: 'Hospital', address: 'Kettegård Allé 30, 2650 Hvidovre', lat: 55.6490, lng: 12.4690, open: '08:00', close: '16:00', contact: 'Ambulatorier' },
  ];

  const KIDS = ['Emil', 'Freja', 'Noah', 'Ida', 'William', 'Alma', 'Oscar', 'Clara', 'Lucas', 'Ella', 'Victor', 'Agnes', 'Malthe', 'Karla', 'Elias', 'Sofia'];
  const ELDERS = ['Inger', 'Bent', 'Kirsten', 'Poul', 'Grethe', 'Jørgen', 'Birthe', 'Erik', 'Hanne', 'Knud', 'Ruth', 'Arne'];
  const ADULTS = ['Mads', 'Line', 'Jonas', 'Camilla', 'Simon', 'Louise', 'Anders', 'Mia', 'Thomas'];
  const LAST = ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen', 'Knudsen'];
  const STREETS = ['Engvej', 'Skolevej', 'Kirkevej', 'Birkevej', 'Ahornvej', 'Hyldevej', 'Rosenvænget', 'Lærkevej', 'Søndergade', 'Bakkevej', 'Tjørnevej', 'Mosevej', 'Granvej', 'Vibevej', 'Kastanievej', 'Elmevej', 'Hasselvej', 'Fasanvej', 'Kildevej', 'Parkvej'];
  const TOWNS = [['Rødovre', '2610', 55.681, 12.454], ['Hvidovre', '2650', 55.642, 12.473], ['Brøndby', '2605', 55.648, 12.418], ['Glostrup', '2600', 55.666, 12.399], ['Albertslund', '2620', 55.657, 12.353], ['Vallensbæk', '2665', 55.623, 12.385], ['Herlev', '2730', 55.724, 12.440], ['Vanløse', '2720', 55.687, 12.491], ['Ishøj', '2635', 55.615, 12.352], ['Ballerup', '2750', 55.731, 12.363]];
  const phone = () => [2, 3, 4, 5].map(() => String(10 + Math.floor(rnd() * 89))).join(' ');

  const groups = [
    { inst: 'i1', n: 14, names: KIDS, type: 'Skolekørsel', days: () => [1, 2, 3, 4, 5], arrive: '08:00', leave: '14:00', maxRide: 45, r: 5.5, wc: [0, 5, 9], alone: [3, 11], escort: [7], rel: ['Mor', 'Far'],
      notes: ['Skal afleveres til personale', '', 'Har høreapparat', '', 'Epilepsi, se plan i tasken', ''] },
    { inst: 'i2', n: 10, names: ELDERS, type: 'Ældrekørsel', days: i => [[1, 3, 5], [2, 4], [1, 2, 3, 4, 5]][i % 3], arrive: '09:30', leave: '15:00', maxRide: 60, r: 4.5, wc: [2, 6, 8], alone: [], escort: [], rel: ['Datter', 'Søn', 'Ægtefælle'],
      notes: ['Rollator', 'Hjælp ned ad trappen', '', 'Rollator', 'Dårlig hørelse, ring på to gange', ''] },
    { inst: 'i3', n: 8, names: ADULTS, type: 'Handicapkørsel', days: () => [1, 2, 3, 4, 5], arrive: '09:00', leave: '15:30', maxRide: 60, r: 6, wc: [0, 4], alone: [6], escort: [2], rel: ['Bosted', 'Mor', 'Kontaktperson'], known: { 0: 'v4' },
      notes: ['Fast chauffør er vigtigt', '', 'Bliver urolig ved ventetid', '', 'Kørestol med el', ''] },
    { inst: 'i4', n: 5, names: ELDERS.slice(6).concat(ADULTS.slice(5)), type: 'Genoptræning', days: () => [2, 4], arrive: '10:00', leave: '12:00', maxRide: 45, r: 4, wc: [1], alone: [], escort: [], rel: ['Ægtefælle', 'Datter'],
      notes: ['Krykker', '', 'Rollator', ''] },
  ];

  const citizens = [], visitations = [];
  let n = 0;
  for (const g of groups) {
    const inst = institutions.find(i => i.id === g.inst);
    for (let i = 0; i < g.n; i++) {
      n++;
      let lat, lng;
      do {
        lat = inst.lat + (rnd() * 2 - 1) * g.r / 111;
        lng = inst.lng + (rnd() * 2 - 1) * g.r / 63;
      } while (lat < 55.61 || lat > 55.735 || lng < 12.33 || lng > 12.51 || hav({ lat, lng }, inst) < 1);
      const town = TOWNS.slice().sort((a, b) => hav({ lat, lng }, { lat: a[2], lng: a[3] }) - hav({ lat, lng }, { lat: b[2], lng: b[3] }))[0];
      const id = 'c' + n;
      citizens.push({
        id, name: g.names[i % g.names.length] + ' ' + LAST[(n * 7) % LAST.length],
        address: `${pick(STREETS)} ${1 + Math.floor(rnd() * 90)}, ${town[1]} ${town[0]}`,
        lat: +lat.toFixed(5), lng: +lng.toFixed(5), phone: phone(),
        relative: `${g.rel[i % g.rel.length]} · ${phone()}`,
        wheelchair: g.wc.includes(i), escort: g.escort.includes(i), alone: g.alone.includes(i),
        knownVehicleId: (g.known && g.known[i]) || '', note: g.notes[i % g.notes.length],
      });
      visitations.push({ id: 'b' + n, citizenId: id, institutionId: g.inst, type: g.type, days: g.days(i), arrive: g.arrive, leave: g.leave, maxRide: g.maxRide, ud: true, hjem: true });
    }
  }

  return {
    version: 1,
    date: nextWeekday(ymd(new Date())),
    clock: toMin('06:00'),
    clockSpeed: 2,
    settings: { speed: 32, road: 1.3, kmRate: 9, hourRate: 420, startFee: 150, autoRun: true, effortMs: 1800, arriveWindow: 20 },
    operators, vehicles, institutions, citizens, visitations,
    cancellations: [], adhoc: [], plans: {}, status: {}, delays: {}, events: [], accepted: {},
  };
}
