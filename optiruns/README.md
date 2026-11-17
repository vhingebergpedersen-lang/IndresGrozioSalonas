# Turplan: prototype for planning municipal passenger transport

A clickable prototype of a SaaS system for **visiteret kørsel** (school transport, transport for people with disabilities, elderly people to day centres, rehabilitation). It is built for transport offices (kørselskontorer) and operators (vognmænd) that run transport for municipalities, and is inspired by the kind of platform Optiruns offers, with its own design and name.

Open `index.html` in a browser. No install or build is needed. The interface is in Danish, and all data is fictional and stored in the browser (localStorage).

## One platform, one entrance per party

| Entrance | What it does in the prototype |
| --- | --- |
| **Kørselskontor** (office portal) | Overview, planning with map, citizens and their approvals (bevillinger), institutions, operators and vehicles, irregularities, scenarios, settings |
| **Institution** | See who arrives and gets picked up today and when, report absence or a closing day |
| **Vognmand** (operator) | See routes and printable trip sheets per vehicle, set drivers, confirm the day, report a vehicle out of service |
| **Borgerapp** (citizen app) | Citizens and relatives see the next trip live, cancel or rebook, and get messages |
| **Chaufførapp** (driver app) | Trip sheet with needs and notes, Picked up / Dropped off / No show, report delays |

All entrances share the same data, so an action in one shows up in the others straight away. For example: a relative cancels in the app, the trip disappears from the driver's route, and the office and institution are notified.

## Planning engine

The optimiser (`js/optimizer.js`) solves a pickup and drop-off problem with:

* arrival window before the start time at the institution, and pickup window after it closes
* **max ride time per citizen** (the service level in the approval)
* seats and wheelchair places, with escorts taking a seat
* **enekørsel**: the citizen rides alone
* **fast chauffør**: the trip must go on one specific vehicle
* the vehicles' shift hours

It uses cheapest insertion, then local search (move a trip to its best place, empty out small routes), repeated with different start orders. The objective is what the municipality pays: km + vehicle hours + a start fee per route. Departures from the garage are pushed as late as possible to cut waiting and ride time.

On the demo data (37 citizens, 9 vehicles, 3 operators), a Tuesday with 33 trips each way plans in about 2 seconds with no rule broken.

## Running the day (live)

The clock in the header simulates the day: press ▶ to watch vehicles drive, stops being completed and arrival times update. From there you can try:

* register a delay (office or driver) and see who will arrive late; affected citizens are notified
* report "ikke mødt" (no show) in the driver app
* add a one-off trip (e.g. to hospital) and insert it into the existing plan without moving anything else
* report a vehicle out of service in the operator portal, then use "Flyt ture til andre biler" in the planner
* move a trip to another vehicle by hand and see warnings if a rule is broken

## Scenarios

Simulate what changes to max ride time, arrival window, vehicle types or hourly price would mean for vehicles, km and cost, for example before a tender. A scenario can be used as the day's plan.

## Files

```
index.html          page layout
css/app.css         styling
js/util.js          helpers (time, geo, formatting)
js/demo.js          fictional demo data
js/store.js         state, trips from approvals, cancellations, events, live status
js/optimizer.js     route optimiser
js/office.js        office portal
js/portals.js       institution, operator, citizen app, driver app
js/main.js          roles, clock, event wiring
```

## Not in the prototype (would be needed for a real product)

* Real road distances and drive times from a routing engine (OSRM, Valhalla, GraphHopper) instead of straight line × road factor
* Backend, database, login with MitID/SSO, roles and access control, audit log
* Security and compliance for sensitive citizen data (GDPR, NIS2), hosting in the EU
* Real mobile apps with GPS tracking and push/SMS notifications
* Integrations: municipal case systems, telephony, finance and invoicing
* Support portal, recurring changes to approvals, holidays and calendars, multiple approvals per citizen
