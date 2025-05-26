import { useState, useEffect } from "react";

// @ts-ignore
const PasswordProtect = ({ children }) => {
  const [password, setPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);

  const correctPassword = "moomba5"; // This should be kept secret, use only for non-sensitive data

  useEffect(() => {
    // Check if the user has already entered the correct password
    if (localStorage.getItem("passwordCorrect") === "true") {
      setAccessGranted(true);
    }
  }, []);

  const handlePasswordChange = (event: any) => {
    setPassword(event.target.value);
  };

  const verifyPassword = () => {
    if (password === correctPassword) {
      // The user entered the correct password, so remember this for next time
      localStorage.setItem("passwordCorrect", "true");
      setAccessGranted(true);
    } else {
      alert("Wrong password");
    }
  };

  if (accessGranted) {
    return <div>{children}</div>;
  }

  return (
    <div>
      <input
        type="password"
        value={password}
        onChange={handlePasswordChange}
        placeholder="Enter password"
      />
      <button onClick={verifyPassword}>Submit</button>
    </div>
  );
};

export default PasswordProtect;
