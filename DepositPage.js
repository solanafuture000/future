import React, { useState } from "react";
import axios from "axios";

function DepositPage() {
  const [amount, setAmount] = useState("");

  const handleDeposit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:3005/api/deposit",
        { amount },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(res.data.message);
    } catch (err) {
      console.error(err);
      alert("Deposit failed");
    }
  };

  return (
    <div>
      <h2>Deposit SOL</h2>
      <form onSubmit={handleDeposit}>
        <input
          type="number"
          placeholder="Enter amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <button type="submit">Deposit</button>
      </form>
    </div>
  );
}

export default DepositPage;
