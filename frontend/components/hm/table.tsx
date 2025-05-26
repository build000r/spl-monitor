"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  sortingFns,
} from "@tanstack/react-table";
import { rankItem, compareItems } from "@tanstack/match-sorter-utils";

// would be cool to make the ranges std dev based

// Fuzzy filter and sort implementations
//@ts-ignore
const fuzzyFilter = (row, columnId, filterValue, addMeta) => {
  const rank = rankItem(row.getValue(columnId), filterValue);
  addMeta({ itemRank: rank });
  return rank.passed;
};
//@ts-ignore
const fuzzySort = (rowA, rowB, columnId) => {
  const rankA = rowA.columnFiltersMeta[columnId]?.itemRank;
  const rankB = rowB.columnFiltersMeta[columnId]?.itemRank;
  return rankA && rankB
    ? compareItems(rankA, rankB)
    : sortingFns.alphanumeric(rowA, rowB, columnId);
};
//@ts-ignore
const numericFilter = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  // Assuming filterValue is like { min: 0, max: 2 }
  return Number(value) >= Number(filterValue);
};
//@ts-ignore
export default function SegmentTable({ onAddressClick }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState([
    { id: "whale_bull_wallet_percent", value: 1 },
    { id: "whale_sum", value: 1 },
    { id: "whale_bear_wallet_percent", value: 0 },
    { id: "period", value: "6H-A" },
    { id: "end_time_start", value: null },
    { id: "end_time_end", value: null },
  ]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });

  const [availablePeriods, setAvailablePeriods] = useState([]);

  const [endTimes, setEndTimes] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  //@ts-ignore
  const handleFilterChange = (id, value) => {
    setColumnFilters((currentFilters) => {
      let isEndTimeStartGreaterThanEndTimeEnd = false;
      let isEndTimeEndLessThanEndTimeStart = false;
      const updatedFilters = currentFilters.map((filter) => {
        if (filter.id === id) {
          //@ts-ignore
          if (id === "end_time_start" && value > filter.value) {
            isEndTimeStartGreaterThanEndTimeEnd = true;
          }
          //@ts-ignore
          if (id === "end_time_end" && value < filter.value) {
            isEndTimeEndLessThanEndTimeStart = true;
          }
          return { ...filter, value };
        }
        return filter;
      });

      if (isEndTimeStartGreaterThanEndTimeEnd) {
        return updatedFilters.map((filter) => {
          if (filter.id === "end_time_end") {
            return { ...filter, value };
          }
          return filter;
        });
      }

      if (isEndTimeEndLessThanEndTimeStart) {
        return updatedFilters.map((filter) => {
          if (filter.id === "end_time_start") {
            return { ...filter, value };
          }
          return filter;
        });
      }

      return updatedFilters;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/v2/segments");
        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }
        const segments = await response.json();
        if (segments && segments.data) {
          const processedData = segments.data.map((d: any) => ({
            ...d,
            whale_bull_wallet_percent: (
              d.whale_bulls *
              d.whale_wallet_percent *
              100
            ).toFixed(2),
            whale_bear_wallet_percent: (
              d.whale_bears *
              d.whale_wallet_percent *
              100
            ).toFixed(2),
            whale_sum: (
              d.whale_bulls * d.whale_wallet_percent * 100 -
              d.whale_bears * d.whale_wallet_percent * 100
            ).toFixed(2),
            end_time_display: new Date(d.end_time * 1000).toLocaleString(),
          }));

          const latestEndTime = Math.max(
            ...processedData.map((d: any) => d.end_time)
          );

          // Update data and filtered data based on the latest end time initially
          const latestData = processedData.filter(
            (d: any) => d.end_time === latestEndTime
          );
          setData(processedData);
          setFilteredData(latestData);

          setColumnFilters((prev) =>
            prev.map((filter) => {
              if (
                filter.id === "end_time_start" ||
                filter.id === "end_time_end"
              ) {
                return { ...filter, value: latestEndTime };
              }
              return filter;
            })
          );

          // set the available filter options
          const uniqueEndTimes = Array.from(
            new Set(processedData.map((item: any) => item.end_time))
          ).sort();

          //@ts-ignore
          setEndTimes(uniqueEndTimes);

          const uniquePeriods = Array.from(
            //@ts-ignore
            new Set(processedData.map((item) => item.period))
          ).sort();

          //@ts-ignore
          setAvailablePeriods(uniquePeriods);
        } else {
          throw new Error("No data received");
        }
      } catch (error) {
        console.error("Failed to fetch segments:", error);
        setError("Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // When period or endTimeRange changes, update filteredData
  useEffect(() => {
    // Extract filter values first to avoid repetitive operations
    const startTimeFilter = columnFilters.find(
      (f) => f.id === "end_time_start"
    )?.value;
    const endTimeFilter = columnFilters.find(
      (f) => f.id === "end_time_end"
    )?.value;
    const periodFilter = columnFilters.find((f) => f.id === "period")?.value;
    // const bullFilter = columnFilters.find(
    //   (f) => f.id === "whale_bull_wallet_percent"
    // )?.value;
    // const bearFilter = columnFilters.find(
    //   (f) => f.id === "whale_bear_wallet_percent"
    // )?.value;

    const newData = data.filter((item: any) => {
      return (
        //@ts-ignore
        (startTimeFilter === null || item.end_time >= startTimeFilter) &&
        //@ts-ignore
        (endTimeFilter === null || item.end_time <= endTimeFilter) &&
        (periodFilter === null || item.period === periodFilter)
        //  &&
        // (bullFilter === null || item.whale_bull_wallet_percent >= bullFilter) &&
        // (bearFilter === null || item.whale_bear_wallet_percent >= bullFilter)
      );
    });

    setFilteredData(newData);
  }, [data, columnFilters]); // Include data in the dependencies array as we are using it inside the effect

  const columns = useMemo(
    () => [
      {
        accessorKey: "address",
        id: "address",
        header: "Address",
        cell: (info: any) => (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              style={{
                backgroundColor: "#4CAF50" /* Green */,
                border: "none",
                color: "white",
                padding: "1px 10px",
                textAlign: "center",
                textDecoration: "none",
                display: "inline-block",
                margin: "4px 2px",
                cursor: "pointer",
              }}
              onClick={() => onAddressClick(info.getValue())}
            >
              chart {"   "}
            </button>

            <button
              onClick={() => navigator.clipboard.writeText(info.getValue())}
              title="Copy to clipboard"
              style={{
                backgroundColor: "#008CBA" /* Blue */,
                border: "none",
                color: "white",
                padding: "1px 10px",
                textAlign: "center",
                textDecoration: "none",
                display: "inline-block",
                margin: "4px 2px",
                cursor: "pointer",
              }}
            >
              copy
            </button>
          </div>
        ),
      },

      {
        accessorKey: "whale_bull_wallet_percent",
        header: "Whale Bulls Wallet %",
        filterFn: numericFilter,
      },
      {
        accessorKey: "whale_sum",
        header: "Whale Bulls Sum",
        filterFn: numericFilter,
      },
      {
        accessorKey: "whale_bear_wallet_percent",
        header: "Whale Bears Wallet %",
        filterFn: numericFilter,
      },
      {
        accessorKey: "end_time_display",
        header: "End Time",
        sortType: fuzzySort,
      },
      // More columns can be added here
    ],
    [onAddressClick]
  ); // Include onAddressClick in the dependency array to ensure updates

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      globalFilter,
      columnFilters,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    //@ts-ignore
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  console.log("Current Page Index:", table.getState().pagination.pageIndex);

  const handleNextPage = () => {
    if (table.getCanNextPage()) {
      const newPageIndex = table.getState().pagination.pageIndex + 1;
      setPagination((prev) => ({ ...prev, pageIndex: newPageIndex }));
    }
  };
  const handlePreviousPage = () => {
    if (table.getCanPreviousPage()) {
      const newPageIndex = table.getState().pagination.pageIndex - 1;
      setPagination((prev) => ({ ...prev, pageIndex: newPageIndex }));
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <div>
          <label htmlFor="globalSearch" style={{ marginRight: "10px" }}>
            Search All Columns:
          </label>
          <input
            id="globalSearch"
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Type to search..."
          />
        </div>

        <div>
          <label htmlFor="periodFilter" style={{ marginRight: "10px" }}>
            Model:
          </label>
          <select
            id="periodFilter"
            //@ts-ignore
            value={columnFilters.find((i) => i.id === "period").value}
            onChange={(e) => handleFilterChange("period", e.target.value)}
          >
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="startTimeFilter" style={{ marginRight: "10px" }}>
            Start Time:
          </label>
          <select
            id="startTimeFilter"
            //@ts-ignore
            value={columnFilters.find((i) => i.id === "end_time_start").value}
            onChange={(e) =>
              handleFilterChange("end_time_start", e.target.value)
            }
          >
            {endTimes.map((time) => (
              <option key={time} value={time}>
                {new Date(time * 1000).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="endTimeFilter" style={{ marginRight: "10px" }}>
            End Time:
          </label>
          <select
            id="endTimeFilter"
            //@ts-ignore
            value={columnFilters.find((i) => i.id === "end_time_end").value}
            onChange={(e) => handleFilterChange("end_time_end", e.target.value)}
          >
            {endTimes.map((time) => (
              <option key={time} value={time}>
                {new Date(time * 1000).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="whaleBullsPercent" style={{ marginRight: "10px" }}>
            Whale Bulls Volume Percent:
          </label>
          <input
            id="whaleBullsPercent"
            type="number"
            //@ts-ignore
            value={
              //@ts-ignore
              columnFilters.find((i) => i.id === "whale_bull_wallet_percent")
                .value
            }
            onChange={(e) =>
              handleFilterChange("whale_bull_wallet_percent", e.target.value)
            }
            placeholder="Enter percentage..."
          />
        </div>
        <div>
          <label htmlFor="whale_sum" style={{ marginRight: "10px" }}>
            Whale Sum Volume Percent:
          </label>
          <input
            id="whale_sum"
            type="number"
            //@ts-ignore
            value={
              //@ts-ignore
              columnFilters.find((i) => i.id === "whale_sum").value
            }
            onChange={(e) => handleFilterChange("whale_sum", e.target.value)}
            placeholder="whale_sum"
          />
        </div>

        <div>
          <label htmlFor="whaleBearsPercent" style={{ marginRight: "10px" }}>
            Whale Bears Volume Percent:
          </label>
          <input
            id="whaleBearsPercent"
            type="number"
            //@ts-ignore
            value={
              //@ts-ignore
              columnFilters.find((i) => i.id === "whale_bear_wallet_percent")
                .value
            }
            onChange={(e) =>
              handleFilterChange("whale_bear_wallet_percent", e.target.value)
            }
            placeholder="Enter percentage..."
          />
        </div>
      </div>

      {/* End Time Range Inputs */}
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getIsSorted()
                    ? header.column.getIsSorted() === "desc"
                      ? " 🔽"
                      : " 🔼"
                    : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell, index) => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button
          onClick={handlePreviousPage}
          disabled={!table.getCanPreviousPage()}
          style={{
            backgroundColor: "black", // black is
            border: "none",
            color: "white",
            padding: "1px 10px",
            textAlign: "center",
            textDecoration: "none",
            display: "inline-block",
            margin: "4px 2px",
            cursor: "pointer",
          }}
        >
          Previous
        </button>
        <button
          onClick={handleNextPage}
          disabled={!table.getCanNextPage()}
          style={{
            backgroundColor: "black",
            border: "none",
            color: "white",
            padding: "1px 10px",
            textAlign: "center",
            textDecoration: "none",
            display: "inline-block",
            margin: "4px 2px",
            cursor: "pointer",
          }}
        >
          Next
        </button>
        <span>
          Page {table.getState().pagination.pageIndex + 1} of{" "}
          {table.getPageCount()}
        </span>
      </div>
    </div>
  );
}
