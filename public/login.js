(async () => {
  console.log(document.getElementById("loginForm"));
  try {
    document
      .getElementById("loginForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const messageDiv = document.getElementById("message");

        try {
          const response = await axios.post(
            "login",
            { username, password },
            {
              headers: { "Content-Type": "application/json" },
            }
          );
          messageDiv.textContent = response.data.message;
          messageDiv.style.color = response.status === 200 ? "green" : "red";
          if (response.status === 200) {
            window.location.href = "/main.html";
          }
        } catch (error) {
          messageDiv.textContent = error.response?.data.message || "Login failed";
          messageDiv.style.color = "red";
        }
      });
  } catch (err) {
    console.error("Error loading login:", err);
  }
})();
