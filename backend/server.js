const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

//NextpaymentDate
const nextPaymentDateSql = `
    CASE
        WHEN sd.billing_cycle = 'Monthly' THEN
            DATE_ADD(sd.start_date, INTERVAL TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) + 1 MONTH)

        WHEN sd.billing_cycle = 'Quarterly' THEN
            DATE_ADD(sd.start_date, INTERVAL (TIMESTAMPDIFF(MONTH, sd.start_date, CURDATE()) DIV 3 + 1) * 3 MONTH)

        WHEN sd.billing_cycle = 'Yearly' THEN
            DATE_ADD(sd.start_date, INTERVAL TIMESTAMPDIFF(YEAR, sd.start_date, CURDATE()) + 1 YEAR)

        ELSE sd.start_date
    END
`;

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


//ADD SUBSCRIPTION
app.post("/add-subscription", (req, res) => {
    const {
        user_id,
        name,
        category,
        amount,
        billing_cycle,
        start_date,
        renewal_date,
        remind_before,
        notes,
        status
    } = req.body;
    const effectiveStartDate = start_date || renewal_date;

    if (!user_id || !name || !amount || !effectiveStartDate) {
        return res.status(400).send("Missing required fields");
    }

    const subscriptionSql = `
        INSERT INTO subscription (user_id, name, amount, renewal_date, status)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        subscriptionSql,
        [user_id, name, amount, effectiveStartDate, status || "active"],
        (subscriptionErr, subscriptionResult) => {
            if (subscriptionErr) {
                console.log(subscriptionErr);
                return res.status(500).send("Error adding subscription");
            }

            const detailsSql = `
                INSERT INTO subscription_details (
                    subscription_id,
                    category,
                    billing_cycle,
                    start_date,
                    remind_before,
                    notes
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(
                detailsSql,
                [
                    subscriptionResult.insertId,
                    category || null,
                    billing_cycle || "Monthly",
                    effectiveStartDate,
                    Number(remind_before || 7),
                    notes || null
                ],
                (detailsErr) => {
                    if (detailsErr) {
                        console.log(detailsErr);
                        return res.status(500).send("Error saving subscription details");
                    }

                    res.send("Subscription added successfully!");
                }
            );
        }
    );
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

// Delete Subscription from SUBSCRIPTIONS
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

// Update Subscription FROM SUBSCRIPTION
app.put("/update-subscription/:id", (req, res) => {
    const id = req.params.id;
    const { status } = req.body;

    const sql = "UPDATE subscription SET status=? WHERE id=?";

    db.query(sql, [status, id], (err) => {
        if (err) return res.send("Error updating");
        res.send("Updated");
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

// Reminder Logic FOR DASHBOARD ONLY
app.get("/reminders/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT 
            sub.*,
            sd.remind_before,
            ${nextPaymentDateSql} AS next_payment_date FROM subscription 
            sub LEFT JOIN subscription_details sd ON sd.subscription_id = sub.id
WHERE sub.user_id = ? AND sub.status = 'active'
AND DATEDIFF(
            ${nextPaymentDateSql},
            CURDATE() ) BETWEEN 0 AND COALESCE(sd.remind_before, 7)`;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error fetching reminders");
        }

        res.json({ upcoming_renewals: result });
    });
});


//FOR REMINDERS PAGE API
app.get("/all-reminders/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT 
             sub.*,
    sub.id AS subscription_id,  
    sd.remind_before,
    sd.read_status,
    sd.dismissed,
            ${nextPaymentDateSql} AS next_payment_date,

            DATEDIFF(
                ${nextPaymentDateSql},
                CURDATE()
            ) AS days_left

        FROM subscription sub
        LEFT JOIN subscription_details sd 
            ON sd.subscription_id = sub.id

       WHERE sub.user_id = ?
AND sub.status = 'active'
AND (sd.dismissed = 0 OR sd.dismissed IS NULL)
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error fetching reminders");
        }

        const processed = result.map(item => {
            let type = "upcoming";

            if (item.days_left < 0) type = "overdue";
            else if (item.days_left <= (item.remind_before || 7)) type = "upcoming";
            else type = "normal";

            return { ...item, type };
        });

        res.json(processed);
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


// Mark-READ API for SUBSCRIPTIONS PAGE
app.put("/mark-read/:id", (req, res) => {
    const id = req.params.id;

    db.query(
        "UPDATE subscription_details SET read_status = 1 WHERE subscription_id = ?",
        [id],
        (err) => {
            if (err) return res.send(err);
            res.send("Marked as read");
        }
    );
});

// MARK ALL AS READ API
app.put("/mark-all-read/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        UPDATE subscription_details sd
        JOIN subscription sub ON sd.subscription_id = sub.id
        SET sd.read_status = 1
        WHERE sub.user_id = ?
    `;

    db.query(sql, [user_id], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error marking all as read");
        }

        res.send("All reminders marked as read");
    });
});

//DISMISS REMINDERS API
app.delete("/dismiss-reminder/:id", (req, res) => {
    const id = req.params.id;

    console.log("ID RECEIVED:", id);

    const sql = `
        UPDATE subscription_details 
        SET dismissed = 1 
        WHERE subscription_id = ?    `;
    db.query(sql, [id], (err, result) => {
        if (err) {
            return res.send("Error dismissing");
        }

        if (result.affectedRows === 0) {
            return res.send("No matching record");
        }

        res.send("Dismissed successfully");
    });
});

//Frontpage API
app.get("/dashboard-summary/:user_id", (req, res) => {
    const user_id = req.params.user_id;

    const sql = `
        SELECT
            SUM(CASE WHEN sub.status = 'active' THEN 1 ELSE 0 END) AS activeSubscriptions,
            COALESCE(SUM(CASE WHEN sub.status = 'active' THEN sub.amount ELSE 0 END), 0) AS monthlySpending,
            SUM(
                CASE
                    WHEN sub.status = 'active'
                    AND DATEDIFF(calc.next_payment_date, CURDATE()) BETWEEN 0 AND COALESCE(sd.remind_before, 7)
                    THEN 1
                    ELSE 0
                END
            ) AS upcomingPayments
        FROM subscription sub
        LEFT JOIN subscription_details sd ON sd.subscription_id = sub.id
        JOIN (
            SELECT
                s.id,
                ${nextPaymentDateSql} AS next_payment_date
            FROM subscription s
            LEFT JOIN subscription_details sd ON sd.subscription_id = s.id
            WHERE s.user_id = ?
        ) calc ON calc.id = sub.id
        WHERE sub.user_id = ?
    `;

    db.query(sql, [user_id, user_id], (err, result) => {
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

//spending trend
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

// 🔍 SEARCH SUBSCRIPTIONS for SUBSCRIPTION page
app.get("/search-subscriptions/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const search = req.query.q;

    const sql = `
        SELECT * FROM subscription
        WHERE user_id = ?
        AND name LIKE ?
    `;

    db.query(sql, [user_id, `%${search}%`], (err, result) => {
        if (err) {
            console.log(err);
            return res.send("Error searching");
        }

        res.json(result);
    });
});