require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://coastal-lodge-frontend.vercel.app",
    ],
    credentials: true,
  })
);

app.use(express.json());

// Connect MongoDB
mongoose
.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch((err) => console.error("MongoDB connection error:", err));

// Schema
const RoomSchema = new mongoose.Schema({
  roomNumber: Number,
  amount: Number,
  commission: Number,
  commissionType: String,
});

const DaySchema = new mongoose.Schema({
  date: String,
  rooms: [RoomSchema],
  totalAmount: Number,
  totalCommission: Number,
  netTotal: Number, // ✅ add this
});

const Day = mongoose.model("Day", DaySchema);

// Save day data
// app.post("/api/day", async (req, res) => {
//   try {
//     const { date, rooms } = req.body;

//     let totalAmount = 0;
//     let totalCommission = 0;

//     rooms.forEach(r => {
//       totalAmount += r.amount;
//       totalCommission += r.commission;
//     });

//     const newDay = new Day({
//       date,
//       rooms,
//       totalAmount,
//       totalCommission,
//     });

//     await newDay.save();
//     res.json({ message: "Saved successfully" });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

//JWT auth


const jwt = require("jsonwebtoken");
// const bcrypt = require("bcryptjs");

app.post("/api/login", async (req, res) => {
  try {
    const { password } = req.body;

    // Compare password
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({
        message: "Invalid password",
      });
    }

    // Generate token
    const token = jwt.sign(
      {
        role: "admin",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      token,
    });

  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "No token",
      });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    next();

  } catch (err) {
    res.status(401).json({
      message: "Invalid token",
    });
  }
};

app.post("/api/day", verifyToken, async (req, res) => {
  try {
    const { date, rooms } = req.body;

    let totalAmount = 0;
    let totalCommission = 0;

    rooms.forEach((room) => {
      totalAmount += Number(room.amount) || 0;
      totalCommission += Number(room.commission) || 0;
    });

    const netTotal = totalAmount - totalCommission;

    // UPDATE existing date OR create new
    await Day.findOneAndUpdate(
      { date },
      {
        date,
        rooms,
        totalAmount,
        totalCommission,
        netTotal,
      },
      {
        new: true,
        upsert: true,
      }
    );

    res.json({
      message: "Day saved successfully",
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// Get all data + totals
app.get("/api/summary", verifyToken, async (req, res) => {
  try {
  const days = await Day.find();

  let overallTotal = 0;

  days.forEach(d => {
    overallTotal += d.totalAmount;
  });

  res.json({
    days,
    overallTotal,
  });
} catch (err) {
  res.status(500).json({
    error: err.message,
  });
}}); 

app.get("/api/analytics", verifyToken, async (req, res) => {
  try {
    const days = await Day.find().sort({ date: 1 });

    if (!days.length) {
      return res.json({
        monthlyRevenue: [],
        weeklyRevenue: [],
        dailyTrend: [],
        stats: {
          totalRevenue: 0,
          totalCommission: 0,
          totalNetProfit: 0,
          averageDailyRevenue: 0,
          bestRevenueDay: null,
          totalDays: 0,
        },
      });
    }

    // Monthly Revenue
    const monthlyMap = {};

    days.forEach((day) => {
      const d = new Date(day.date);

      const month = d.toLocaleString("default", {
        month: "short",
      });

      if (!monthlyMap[month]) {
        monthlyMap[month] = 0;
      }

      monthlyMap[month] += day.totalAmount || 0;
    });

    const monthlyRevenue = Object.entries(monthlyMap).map(
      ([month, total]) => ({
        month,
        total,
      })
    );

    // Weekly Revenue
    const weeklyRevenue = [];

    for (let i = 0; i < days.length; i += 7) {
      const weekDays = days.slice(i, i + 7);

      const total = weekDays.reduce(
        (sum, day) => sum + (day.totalAmount || 0),
        0
      );

      weeklyRevenue.push({
        week: `Week ${Math.floor(i / 7) + 1}`,
        total,
      });
    }

    // Daily Trend
    const dailyTrend = days.map((day) => ({
      date: day.date,
      revenue: day.totalAmount || 0,
      commission: day.totalCommission || 0,
      net: day.netTotal || 0,
    }));

    // Stats
    const totalRevenue = days.reduce(
      (sum, day) => sum + (day.totalAmount || 0),
      0
    );

    const totalCommission = days.reduce(
      (sum, day) => sum + (day.totalCommission || 0),
      0
    );

    const totalNetProfit = days.reduce(
      (sum, day) => sum + (day.netTotal || 0),
      0
    );

    const averageDailyRevenue = Math.round(
      totalRevenue / days.length
    );

    const bestRevenueDay = days.reduce((best, current) =>
      current.totalAmount > best.totalAmount
        ? current
        : best
    );

    const lowestRevenueDay = days.reduce((lowest, current) =>
  current.totalAmount < lowest.totalAmount
    ? current
    : lowest
);

const highestCommissionDay = days.reduce((highest, current) =>
  current.totalCommission > highest.totalCommission
    ? current
    : highest
);

    res.json({
      monthlyRevenue,
      weeklyRevenue,
      dailyTrend,
      stats: {
        totalRevenue,
        totalCommission,
        totalNetProfit,
        averageDailyRevenue,
        bestRevenueDay: {
          date: bestRevenueDay.date,
          amount: bestRevenueDay.totalAmount,
        },

        lowestRevenueDay: {
          date: lowestRevenueDay.date,
          amount: lowestRevenueDay.totalAmount,
        },

        highestCommissionDay: {
          date: highestCommissionDay.date,
          amount: highestCommissionDay.totalCommission,
        },

        totalDays: days.length,
      },
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});


app.delete("/api/history", verifyToken, async (req, res) => {
  try {
    await Day.deleteMany({});

    res.json({
      message: "All history cleared",
    });

  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(5000, () => console.log("Server running on port 5000"));