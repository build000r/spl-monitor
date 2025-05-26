import React, { useState, useEffect, useMemo, useCallback } from "react";
import { debounce } from "lodash";

const DropdownSearchMenu = ({
  tokensTracking,
  onTokenSelect,
}: {
  tokensTracking: any;
  onTokenSelect: any;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTokens, setFilteredTokens] = useState(tokensTracking);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Debounce the filter function to improve performance
  const debouncedFilter = useCallback(
    debounce((query) => {
      setFilteredTokens(
        tokensTracking.filter(
          (token: any) =>
            token.symbol.toLowerCase().includes(query.toLowerCase()) ||
            token.address.toLowerCase().includes(query.toLowerCase())
        )
      );
    }, 300), // Adjust the debounce delay as needed
    [tokensTracking]
  );

  useEffect(() => {
    debouncedFilter(searchQuery);
    // Cancel the debounce on cleanup
    return () => debouncedFilter.cancel();
  }, [searchQuery, debouncedFilter]);

  const handleInputChange = (e: any) => {
    setSearchQuery(e.target.value);
    setDropdownOpen(true); // Open the dropdown when typing
  };

  const handleDropdownToggle = () => {
    setDropdownOpen((prev) => !prev);
  };

  const handleTokenClick = (token: any) => {
    onTokenSelect(token.address); // Call the parent callback with the selected token
    setSearchQuery(token.symbol); // Set the search query to the selected token symbol
    setDropdownOpen(false); // Close the dropdown
  };

  return (
    <div style={{ maxWidth: "200px" }}>
      <input
        type="text"
        value={searchQuery}
        onChange={handleInputChange}
        onFocus={() => setDropdownOpen(true)} // Open the dropdown when the input is focused
        placeholder="Search tokens..."
        style={{ padding: "10px", width: "100%", boxSizing: "border-box" }}
      />
      <button
        onClick={handleDropdownToggle}
        style={{
          padding: "10px",
          width: "100%",
          boxSizing: "border-box",
          marginTop: "5px",
        }}
      >
        {dropdownOpen ? "Hide All Tokens" : "Show All Tokens"}
      </button>
      {dropdownOpen && (
        <ul
          style={{
            listStyleType: "none",
            padding: 0,
            margin: 0,
            border: "1px solid #ccc",
            maxHeight: "150px",
            overflowY: "auto",
            marginTop: "5px",
          }}
        >
          {filteredTokens.length > 0 ? (
            filteredTokens.map((token: any) => (
              <li
                key={token.address} // Assuming `address` is unique
                onClick={() => handleTokenClick(token)}
                style={{
                  padding: "10px",
                  cursor: "pointer",
                  backgroundColor: "#fff",
                  borderBottom: "1px solid #ccc",
                }}
              >
                {token.symbol} - {token.chain}
              </li>
            ))
          ) : (
            <li style={{ padding: "10px", backgroundColor: "#fff" }}>
              No matches found
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default DropdownSearchMenu;
