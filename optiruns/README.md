# RouteRunner (route planning prototype)

A browser prototype of a route planning and dispatch system, in the style of tools like Optiruns.
Open `index.html` in a browser. No install or build needed. Data is kept in the browser (localStorage).

## What it does

* **Planner**: map with all stops and the depot, one coloured route per driver, ETAs, time used per shift, km saved compared with handing out stops in list order.
* **Optimise routes**: assigns stops to drivers and orders them. It respects customer time windows, service time, vehicle capacity and shift length. Uses cheapest insertion followed by local search (2-opt, relocate, swap) with several restarts.
* **Manual changes**: move a stop to another driver, change the order, or unplan it. ETAs are recalculated and problems (late, overtime, over capacity) are flagged.
* **Stops**: add, edit and delete stops, address lookup (OpenStreetMap Nominatim), CSV import and export. Stops can also be added by clicking the map.
* **Drivers**: shift hours, capacity, colour, active today.
* **Driver app**: phone view for a driver with the day's stops, Navigate (Google Maps), Delivered and Failed. Progress shows live in the Planner.
* **Settings**: depot, average speed, road factor, optimiser effort, demo data.

## Limits of the prototype

* Distances are straight line × a road factor, not real roads. Next step would be a routing engine (OSRM, Valhalla, GraphHopper or Google Routes) for a real distance matrix and route lines.
* Single user, no login, no backend. A real product would need a server, user accounts, a real mobile app for drivers, live GPS and customer SMS notifications.

## CSV format

```
name,address,lat,lng,from,to,service,demand,note
Hansen Bageri,"Nørrebrogade 120, Nørrebro",55.6941,12.5490,07:30,10:00,10,3,
```
