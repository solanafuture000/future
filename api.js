import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:3005", // Backend server URL
});

export default API;
