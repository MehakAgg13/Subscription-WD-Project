const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "subscription_db"
});

db.connect(err => {
    if (err)
        console.log("DB Error");
    else
        console.log("MySQL Connected");
});

// Test route
app.get("/", (req, res) => {
    res.send("Backend running");
});

// Start server
app.listen(5000, () => {
    console.log("Server running on port 5000");
});


// Get user details for settings page
app.get("/user/:id", (req, res) => {
    const user_id = req.params.id;

    const sql = "SELECT name, email FROM users WHERE user_id=?";

    db.query(sql, [user_id], (err, result) => {
        if (err) return res.send("Error");

        if (result.length > 0) {
            res.json(result[0]);
        } else {
            res.send("User not found");
        }
    });
});


//Signup API
app.post("/signup", (req, res) => {
    const { name, email, password } = req.body;
    const sql = "Insert into users (name,email,password) values (?, ?, ?) ";

    db.query(sql, [name, email, password], (err, result) => {
        if (err) {
            console.log(err);
            res.send("Error saving user");
        }
        else {
            res.send("Signup successful!!")
        }

        console.log(name, email, password);

    });

});



//Login API
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    console.log("Login Data:", email, password);

    const sql = "SELECT * FROM users WHERE email=? AND password=?";

    db.query(sql, [email, password], (err, result) => {
        if (err) {
            console.log(err);
            res.send("Error");
        }
        else if (result.length > 0) {
            res.json({
                message: "Login successful",
                user_id: result[0].user_id,
                email: result[0].email
            });

        }
        else {
            console.log("No match found");
            res.send("Invalid credentials");
        }
    });
});


// FORGOT PASSWORD API
app.post("/forgot-password", (req, res) => {
    const { email, newPassword } = req.body;

    // Check if email exists
    const checkSql = "SELECT * FROM users WHERE email=?";

    db.query(checkSql, [email], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error");
        }

        if (result.length === 0) {
            return res.send("Email not found");
        }

        // Update password
        const updateSql = "UPDATE users SET password=? WHERE email=?";

        db.query(updateSql, [newPassword, email], (err2, result2) => {
            if (err2) {
                console.log(err2);
                return res.send("Error updating password");
            }

            res.send("Password updated successfully");
        });
    });
});



// Add Subscription
app.post("/add-subscription", (req, res) => {
    const { user_id, name, amount, renewal_date, status } = req.body;

    const sql = `
        INSERT INTO subscription (user_id, name, amount, renewal_date, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [user_id, name, amount, renewal_date, status], (err) => {
        if (err) return res.send("Error adding subscription");

        res.send("Subscription added successfully!");
    });
});

// Get all subscriptions for logged-in user
app.get("/subscriptions/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = "SELECT * FROM subscription WHERE user_id=?";

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error fetching subscriptions");
        }

        res.json(result);
    });
});

// Delete Subscription
app.delete("/delete-subscription/:id", (req, res) => {
    const id = req.params.id;
    const sql = "DELETE FROM subscription WHERE id=?";

    db.query(sql, [id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error deleting subscription");
        }
        res.send("Subscription deleted successfully!");
    });
});

// Update Subscription
app.put("/update-subscription/:id", (req, res) => {
    const id = req.params.id;
    const { name, amount, renewal_date, status } = req.body;
    const sql = "UPDATE subscription SET name=?, amount=?, renewal_date=?, status=? WHERE id=?";

    db.query(sql, [name, amount, renewal_date, status, id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error updating subscription");
        }
        res.send("Subscription updated successfully!");
    });
});

// Total Monthly Spending
app.get("/total-spending/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const sql = "SELECT SUM(amount) AS total FROM subscription WHERE user_id=? AND status='active'";

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error calculating spending");
        }
        res.json({ total_monthly_spending: result[0].total });
    });
});

// Reminder Logic
app.get("/reminders/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const sql = `SELECT * FROM subscription 
    WHERE user_id=? 
    AND status='active' 
    AND renewal_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error fetching reminders");
        }
        if (result.length === 0) {
            return res.json({ message: "No upcoming renewals in next 7 days" });
        }
        res.json({ upcoming_renewals: result });
    });
});

// DELETE ACCOUNT & SUBSCRIPTIONS API
app.delete("/delete-user/:id", (req, res) => {
    const user_id = req.params.id;

    const deleteSubs = "DELETE FROM subscription WHERE user_id=?";
    const deleteUser = "DELETE FROM users WHERE user_id=?";

    db.query(deleteSubs, [user_id], (err) => {
        if (err) return res.send("Error deleting subscriptions");

        db.query(deleteUser, [user_id], (err2) => {
            if (err2) return res.send("Error deleting user");

            res.send("Account deleted successfully");
        });
    });
});


app.get("/dashboard-summary/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeSubscriptions,
            COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) AS monthlySpending,
            SUM(
                CASE
                    WHEN status = 'active'
                    AND renewal_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                    THEN 1
                    ELSE 0
                END
            ) AS upcomingPayments
        FROM subscription
        WHERE user_id = ?
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error loading dashboard summary" });
        }

        const summary = result[0] || {};
        const monthlySpending = Number(summary.monthlySpending || 0);

        res.json({
            activeSubscriptions: Number(summary.activeSubscriptions || 0),
            monthlySpending,
            upcomingPayments: Number(summary.upcomingPayments || 0),
            savedThisYear: Math.round(monthlySpending * 0.15)
        });
    });
});

app.get("/spending-trend/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT
            DATE_FORMAT(renewal_date, '%b') AS monthLabel,
            MONTH(renewal_date) AS monthNumber,
            YEAR(renewal_date) AS yearNumber,
            COALESCE(SUM(amount), 0) AS total
        FROM subscription
        WHERE user_id = ?
        GROUP BY YEAR(renewal_date), MONTH(renewal_date), DATE_FORMAT(renewal_date, '%b')
        ORDER BY yearNumber, monthNumber
        LIMIT 6
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error loading spending trend" });
        }

        res.json({
            labels: result.map((row) => row.monthLabel),
            values: result.map((row) => Number(row.total || 0))
        });
    });
});
