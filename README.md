# DP Cake Studio - Cake Ordering and Order Management System

A responsive college-project website with two entry points:

- **Consumer:** sign in using a name (optional) and a 10-digit Indian mobile number, without an OTP; browse cakes, submit an order, optionally attach a reference image, and view orders placed from that number.
- **DP Cake Studio:** sign in using the six-digit project PIN `135581`; view incoming orders, customer contacts, order requirements and reference photos; update order status.

The website does **not** send SMS/WhatsApp messages or collect online payments. Consumers get an on-screen order ID and confirmation. Orders are stored by the server in `data/orders.json`, so devices reaching the same running server share the order list.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Copy `.env.example` to `.env` (Windows PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`).
4. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

5. Open `http://localhost:3000` in your browser. Use `135581` for the studio demo PIN.

For testing orders from another phone on the same Wi-Fi, run the server on the computer and open `http://<computer-LAN-IP>:3000` on the phone, allowing the port through your private-network firewall. The computer and phone must be on the same network. `localhost` on a phone points to the phone, not the computer.

## Configuration

Set `ADMIN_PIN`, `SESSION_SECRET` and optionally `PORT` in `.env`. The requested six-digit PIN is supplied only as the demonstration default. Change it and use a long random `SESSION_SECRET` before deployment. Do not commit `.env` to source control.

## Hosting and persistent orders

To make the site reachable from phones outside your local Wi-Fi, deploy the app to a Node.js host with HTTPS. The order file and uploads require persistent writable storage; some free hosting plans erase local files on restart. For a real business system, replace JSON-file storage with a database such as SQLite/PostgreSQL, add backups, rate limiting, secure verified customer sign-in, stronger admin authentication, privacy controls and monitoring.

## Important demo limitations

- Consumer phone-number login is intentionally OTP-free, so it identifies a number entered by the visitor but does not prove phone ownership. A visitor can enter another person's number.
- The in-memory session store is suitable only for a small local/class demonstration, not production hosting.
- The six-digit PIN is a convenience gate for a classroom demo, not a production-grade account system.
- Cake names and illustrations are sample content. The project does not set prices, confirm stock, charge customers or send external notifications.
- Uploaded reference photos are stored in `uploads/` on the server and are linked from the studio dashboard. Set retention and access rules before real-world use.

## Main routes

| Method and route | Purpose |
|---|---|
| `GET /api/session` | Current session summary |
| `POST /api/consumer/login` | Start consumer session using phone number |
| `POST /api/admin/login` | Verify the studio PIN |
| `POST /api/orders` | Save a consumer's cake order (supports image upload) |
| `GET /api/orders/mine` | List orders associated with the signed-in number |
| `GET /api/admin/orders` | Read all orders (studio only) |
| `GET /api/admin/photos/:filename` | View an uploaded reference photo (studio only) |
| `PATCH /api/admin/orders/:id/status` | Update order status (studio only) |
| `POST /api/logout` | End the current session |
| `GET /api/health` | Basic health check |

## Project structure

```text
dp-cake-studio/
  server.js             Express API and session access checks
  public/
    index.html          Consumer, login and studio interface
    styles.css          Responsive visual design
    app.js              Form logic, API calls and dashboard rendering
    assets/mark.svg     Small brand mark
  data/orders.json      Local order records (created at runtime)
  uploads/              Customer reference images
  .env.example          Local configuration template
```
