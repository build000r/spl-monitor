"use client";
import { useEffect, useState, useRef } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  LineController,
} from "chart.js";
import SegmentTable from "@/components/hm/table";
import PasswordProtect from "@/components/PasswordProtect";
import DropdownSearchMenu from "./DropdownSearch";
import _ from "lodash";

// Register chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController
);

// Dynamically import chartjs-plugin-zoom
const importZoomPlugin = () => import("chartjs-plugin-zoom");

interface WhaleChartProps {
  queryAddress: string;
}

interface DataItem {
  [key: string]: any;
  start_time: any;
  end_time: any;
}

export default function WhaleChart({ queryAddress }: WhaleChartProps) {
  const [data, setData] = useState<DataItem[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [chartData, setChartData] = useState<any>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [isClient, setIsClient] = useState<boolean>(false);
  const chartRef = useRef<any>(null);

  const [maPeriods, setMaPeriods] = useState<
    { smaPeriod: number; emaPeriod: number }[]
  >([
    { smaPeriod: 8, emaPeriod: 4 },
    { smaPeriod: 12, emaPeriod: 6 },
    { smaPeriod: 16, emaPeriod: 8 },
    { smaPeriod: 32, emaPeriod: 16 },
  ]);
  const [newSmaPeriod, setNewSmaPeriod] = useState<number | "">("");
  const [newEmaPeriod, setNewEmaPeriod] = useState<number | "">("");

  const handleAddPeriod = () => {
    if (
      newSmaPeriod &&
      newEmaPeriod &&
      !maPeriods.some(
        (p) => p.smaPeriod === newSmaPeriod && p.emaPeriod === newEmaPeriod
      )
    ) {
      setMaPeriods([
        ...maPeriods,
        { smaPeriod: newSmaPeriod, emaPeriod: newEmaPeriod },
      ]);
      setNewSmaPeriod("");
      setNewEmaPeriod("");
    }
  };

  const handleRemovePeriod = (smaPeriod: number, emaPeriod: number) => {
    setMaPeriods(
      maPeriods.filter(
        (p) => p.smaPeriod !== smaPeriod || p.emaPeriod !== emaPeriod
      )
    );
  };
  const [tokensTracking, setTokensTracking] = useState<string[]>([]);

  const convertToCSV = (data: DataItem[]) => {
    const headers = Object.keys(data[0]).join(",") + "\n";
    const rows = data
      .map((obj: DataItem) => {
        const convertedObj = { ...obj };
        convertedObj.start_time = `${new Date(convertedObj.start_time * 1000)
          .toUTCString()
          .replace(",", "")}`;

        convertedObj.end_time = `${new Date(convertedObj.end_time * 1000)
          .toUTCString()
          .replace(",", "")}`;

        return Object.values(convertedObj).join(",");
      })
      .join("\n");
    return headers + rows;
  };

  const downloadCSV = () => {
    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (queryAddress) {
      setSelectedAddress(queryAddress);
    }
  }, [queryAddress]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/v2/tokens_tracking");
        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }
        const tokens_to_track = await response.json();
        if (tokens_to_track && tokens_to_track.data) {
          setTokensTracking(tokens_to_track.data);
        } else {
          throw new Error("No data received");
        }
      } catch (error) {
        console.error("Failed to fetch tokens_to_track:", error);
        setError("Error: Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddressClick = (address: string) => {
    setSelectedAddress(address);
  };

  useEffect(() => {
    // FETCH data and basic pre processing. THEN MA data in another function
    const fetchData = async () => {
      if (!selectedAddress) return;
      try {
        const response = await fetch(
          `/api/v2/segments?address=${selectedAddress}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }
        const segments = await response.json();
        if (segments && segments.data && segments.data.length > 0) {
          const calcData = segments.data.map((d: any) => {
            return {
              ...d,
              new_trader_net_tokens_48h:
                Number(d.new_trader_tokens_bought_48h) -
                Number(d.new_trader_tokens_sold_48h),
              recurring_trader_net_tokens_48h:
                Number(d.reccuring_trader_tokens_bought_48h) -
                Number(d.reccuring_trader_tokens_sold_48h),
              net_tokens:
                Number(d.token_buy_volume) - Number(d.token_sell_volume),
            };
          });

          setData(calcData);
        } else {
          setData([]);
          setError("No segment data for token yet");
        }
      } catch (error) {
        console.error("Failed to fetch segments:", error);
        setError("Error: Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedAddress]);

  const calculateMovingAverage = (
    data: number[],
    windowSize: number
  ): number[] => {
    const movingAverages = [];

    for (let i = 0; i < data.length; i++) {
      if (i < windowSize - 1) {
        movingAverages.push(NaN);
      } else {
        const windowData = data.slice(i - windowSize + 1, i + 1);
        const windowAverage =
          windowData.reduce((sum, value) => sum + value, 0) / windowSize;
        movingAverages.push(parseFloat(windowAverage.toFixed(2)));
      }
    }

    return movingAverages;
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsClient(true);
      importZoomPlugin().then(({ default: zoomPlugin }) => {
        ChartJS.register(zoomPlugin);

        if (data.length > 0 && selectedAddress) {
          const selectedData = data.filter(
            (item: any) => item.address === selectedAddress
          );

          const walletPercentages = (
            categories: string[],
            selectedData: any[]
          ) => {
            const colors: any = {
              whale: {
                backgroundColor: "rgba(100, 159, 64, 0.2)",
                borderColor: "rgba(100, 159, 64, 1)",
              },
              dolphin: {
                backgroundColor: "rgba(54, 162, 235, 0.2)",
                borderColor: "rgba(54, 162, 235, 1)",
              },
              fish: {
                backgroundColor: "rgba(255, 206, 86, 0.2)",
                borderColor: "rgba(255, 206, 86, 1)",
              },
              shrimp: {
                backgroundColor: "rgba(255, 99, 132, 0.2)",
                borderColor: "rgba(255, 99, 132, 1)",
              },
            };

            return categories.map((category: string) => {
              const { backgroundColor, borderColor } = colors[category];

              return {
                label: `${category} net wallet %`,
                data: selectedData.map((d: any) =>
                  Number(
                    (
                      d[`${category}_bulls`] *
                        d[`${category}_wallet_percent`] *
                        100 -
                      d[`${category}_bears`] *
                        d[`${category}_wallet_percent`] *
                        100
                    ).toFixed(2)
                  )
                ),
                backgroundColor,
                borderColor,
                borderWidth: 1,
                yAxisID: "y2",
                hidden: true,
              };
            });
          };

          const new_recc_volume = (
            categories: string[],
            selectedData: any[]
          ) => {
            const colors: {
              [key: string]: { backgroundColor: string; borderColor: string };
            } = {
              token_buy_volume: {
                backgroundColor: "rgba(100, 159, 64, 0.2)",
                borderColor: "rgba(100, 159, 64, 1)",
              },
              token_sell_volume: {
                backgroundColor: "rgba(54, 162, 235, 0.2)",
                borderColor: "rgba(54, 162, 235, 1)",
              },
              new_traders_48h: {
                backgroundColor: "rgba(255, 206, 86, 0.2)",
                borderColor: "rgba(255, 206, 86, 1)",
              },
              recurring_traders_48h: {
                backgroundColor: "rgba(255, 99, 132, 0.2)",
                borderColor: "rgba(255, 99, 132, 1)",
              },
              new_trader_tokens_bought_48h: {
                backgroundColor: "rgba(153, 102, 255, 0.2)",
                borderColor: "rgba(153, 102, 255, 1)",
              },
              new_trader_tokens_sold_48h: {
                backgroundColor: "rgba(75, 192, 192, 0.2)",
                borderColor: "rgba(75, 192, 192, 1)",
              },
              reccuring_trader_tokens_bought_48h: {
                backgroundColor: "rgba(255, 159, 64, 0.2)",
                borderColor: "rgba(255, 159, 64, 1)",
              },
              reccuring_trader_tokens_sold_48h: {
                backgroundColor: "rgba(130, 130, 130, 0.2)",
                borderColor: "rgba(130, 130, 130, 1)",
              },
            };

            const datasets = categories.map((category: string) => {
              const { backgroundColor, borderColor } = colors[category] || {
                backgroundColor: "rgba(0, 0, 0, 0.2)",
                borderColor: "rgba(0, 0, 0, 1)",
              };

              const y = () => {
                if (
                  category == "token_buy_volume" ||
                  category == "token_sell_volume"
                ) {
                  return "y3";
                }
                if (
                  category == "new_traders_48h" ||
                  category == "recurring_traders_48h"
                ) {
                  return "y4";
                } else {
                  return "y5";
                }
              };

              return {
                label: `${category.replace(/_/g, " ")}`,
                data: selectedData.map((d: any) => Number(d[category])),
                backgroundColor,
                borderColor,
                borderWidth: 1,
                yAxisID: y(),
                type: "bar",
                hidden: true,
              };
            });

            datasets.push({
              label: "Tokens bought - Tokens Sold (New Trader)",
              // data: calculateMovingAverage(
              //   selectedData.map((d: any) => d.new_trader_net_tokens_48h),
              //   7
              // ),
              data: selectedData.map((d) => d.new_trader_net_tokens_48h),
              backgroundColor: "rgba(60, 0, 90, 0.2)",
              borderColor: "rgba(60, 0, 90, 1)",
              borderWidth: 2,
              yAxisID: "y3",
              type: "line",
              hidden: true,
            });

            datasets.push({
              label: "Tokens bought - Sold (All)",
              data: selectedData.map((d: any) => d.net_tokens),
              // data: calculateMovingAverage(
              //   selectedData.map((d: any) => d.net_tokens),
              //   7
              // ),
              backgroundColor: "rgba(0, 100, 255, 0.2)",
              borderColor: "rgba(0, 100, 255, 1)",
              borderWidth: 2,
              yAxisID: "y3",
              type: "line",
              hidden: true,
            });

            return datasets;
          };

          if (selectedData.length > 0) {
            setChartData({
              labels: selectedData.map((item: any) =>
                new Date(item.end_time * 1000).toUTCString()
              ),
              datasets: [
                {
                  label: "End Price",
                  data: selectedData.map((item: any) => item.end_price),
                  backgroundColor: "rgba(54, 162, 235, 0.2)",
                  borderColor: "rgba(54, 162, 235, 1)",
                  borderWidth: 1,
                  type: "line",
                  yAxisID: "y1",
                  hidden: true,
                },
                {
                  label: "Total Buy Volume",
                  data: selectedData.map((item: any) => item.total_buy_volume),
                  backgroundColor: "rgba(300, 162, 235, 0.2)",
                  borderColor: "rgba(300, 162, 235, 1)",
                  borderWidth: 1,
                  type: "line",
                  hidden: true,
                  yAxisID: "y3",
                },
                {
                  label: "tokens_pct_change_z_score_8_period",
                  data: selectedData.map(
                    (item: any) => item.tokens_pct_change_z_score_8_period
                  ),
                  backgroundColor: "rgba(60, 0, 90, 0.2)",
                  borderColor: "rgba(60, 0, 90, 1)",
                  borderWidth: 1,
                  type: "line",
                  hidden: true,
                  yAxisID: "y6",
                },
                {
                  label: "tokens_pct_change_z_score_12_period",
                  data: selectedData.map(
                    (item: any) => item.tokens_pct_change_z_score_12_period
                  ),
                  backgroundColor: "rgba(0, 60, 90, 0.2)",
                  borderColor: "rgba(0, 60, 90, 1)",
                  borderWidth: 1,
                  type: "line",
                  hidden: true,
                  yAxisID: "y6",
                },
                {
                  label: "tokens_pct_change_z_score_16_period",
                  data: selectedData.map(
                    (item: any) => item.tokens_pct_change_z_score_16_period
                  ),
                  backgroundColor: "rgba(90, 0, 60, 0.2)",
                  borderColor: "rgba(90, 0, 60, 1)",
                  borderWidth: 1,
                  type: "line",
                  hidden: true,
                  yAxisID: "y6",
                },
                {
                  label: "tokens_pct_change_z_score_32_period",
                  data: selectedData.map(
                    (item: any) => item.tokens_pct_change_z_score_32_period
                  ),
                  backgroundColor: "rgba(0, 90, 60, 0.2)",
                  borderColor: "rgba(0, 90, 60, 1)",
                  borderWidth: 1,
                  type: "line",
                  hidden: true,
                  yAxisID: "y6",
                },
                ...walletPercentages(
                  ["whale", "dolphin", "fish", "shrimp"],
                  selectedData
                ),
                ...new_recc_volume(
                  [
                    "token_buy_volume",
                    "token_sell_volume",
                    "new_traders_48h",
                    "recurring_traders_48h",
                    "new_trader_tokens_bought_48h",
                    "new_trader_tokens_sold_48h",
                    "reccuring_trader_tokens_bought_48h",
                    "reccuring_trader_tokens_sold_48h",
                  ],
                  selectedData
                ),
              ],
            });
          }
        }
      });
    }
  }, [selectedAddress, data]);

  const resetZoom = () => {
    const chart = chartRef.current;
    if (chart) {
      chart.resetZoom();
    }
  };

  const zoomIn = () => {
    const chart = chartRef.current;
    if (chart) {
      chart.zoom(1.1);
    }
  };

  const zoomOut = () => {
    const chart = chartRef.current;
    if (chart) {
      chart.zoom(0.9);
    }
  };

  //
  // @ts-ignore
  function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let emaArray = Array(period).fill(NaN); // start with NaN for the first 'period' data points

    emaArray[period - 1] =
      //@ts-ignore
      data.slice(0, period).reduce((a, b) => a + b, 0) / period; // simple average for the first EMA

    for (let i = period; i < data.length; i++) {
      emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
    }

    return emaArray;
  }
  const BarChart = ({ data }: any) => {
    const adjustColor = (color: string) => {
      // Extract the rgba values
      const rgba = color.match(/rgba?\((\d+), (\d+), (\d+), (\d(\.\d+)?)\)/);
      if (!rgba) return color; // If it's not a valid rgba string, return the original color

      const r = Math.min(255, parseInt(rgba[1]) * 1.25);
      const g = Math.min(255, parseInt(rgba[2]) * 1.25);
      const b = Math.min(255, parseInt(rgba[3]) * 1.25);
      const a = rgba[4];

      return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    return maPeriods.map((period: any) => {
      const mAdsets = data.datasets.map((d: any) => {
        return {
          ...d,
          data: calculateMovingAverage(d.data, period.smaPeriod),
        };
      });

      if (!mAdsets) return null;

      // @ts-ignore
      function calculateMean(arr) {
        // @ts-ignore

        const filteredArr = arr.filter((x) => !isNaN(x));
        // @ts-ignore

        return filteredArr.reduce((a, b) => a + b, 0) / filteredArr.length;
      }
      // @ts-ignore

      function calculateStdDev(arr, mean) {
        // @ts-ignore

        const filteredArr = arr.filter((x) => !isNaN(x));
        return Math.sqrt(
          // @ts-ignore

          filteredArr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) /
            (filteredArr.length - 1)
        );
      }

      // @ts-ignore

      function calculateZScore(x, mean, stdDev) {
        let z = isNaN(x) ? NaN : (x - mean) / stdDev;

        // MOOSE REMOVE OUTLIER
        if (z > 5) z = 5;
        if (z < -5) z = -5;

        return z;
      }

      // Calculate percentage changes
      let percentageChanges = mAdsets
        .filter((item: any) => item.label === "Tokens bought - Sold (All)")[0]
        .data.map((item: any, i: number, arr: any[]) => {
          if (i === 0) return NaN;
          return (((item - arr[i - 1]) / Math.abs(arr[i - 1])) as number) * 100;
        });

      // @ts-ignore

      let zScores = percentageChanges.map((x, i, arr) => {
        if (i === 0) return NaN;
        let pastData = arr.slice(0, i);
        let mean = calculateMean(pastData);
        let stdDev = calculateStdDev(pastData, mean);
        return calculateZScore(x, mean, stdDev);
      });

      let emaDatasets = data.datasets.map((d: any) => {
        return {
          ...d,
          label: `${d.label} EMA`,
          data: calculateEMA(d.data, period.emaPeriod),
          backgroundColor: adjustColor(d.backgroundColor),
          borderColor: adjustColor(d.borderColor),
        };
      });

      let newDatasets = {
        ...data,
        datasets: [
          {
            label: "Real Price",
            data: data.datasets.filter(
              (item: any) => item.label === "End Price"
            )[0].data,
            backgroundColor: "rgba(100, 162, 235, 0.2)",
            borderColor: "rgba(100, 162, 235, 1)",
            borderWidth: 1,
            type: "line",
            yAxisID: "y1",
          },
          {
            label: "Net Tokens % Change",
            data: percentageChanges,
            backgroundColor: "rgba(300d, 162, 235, 0.2)",
            borderColor: "rgba(300d, 162, 235, 1)",
            borderWidth: 1,
            type: "line",
            yAxisID: "y4",
          },
          {
            label: "Net Tokens % Change Z-Scores",
            data: zScores,
            backgroundColor: "rgba(300, 162, 235, 0.2)",
            borderColor: "rgba(300, 162, 235, 1)",
            borderWidth: 1,
            type: "line",
            yAxisID: "y5",
          },
          ...mAdsets,
          ...emaDatasets,
        ]
          .filter((d: any) => !d.label.startsWith("tokens_pct_change_z_score_"))
          .sort((a: any, b: any) => {
            return a.label > b.label ? 1 : -1;
          }),
      };

      return (
        <div key={Math.random() * period.emaPeriod * period.smaPeriod}>
          <h3>
            period.smaPeriod: {period.smaPeriod}, days: {period.smaPeriod / 4}
            <br />
            period.emaPeriod: {period.emaPeriod}, days: {period.emaPeriod / 4}
          </h3>

          <Bar
            ref={chartRef}
            data={newDatasets}
            options={{
              animation: false,
              scales: {
                y1: {
                  beginAtZero: false,
                },
                y2: {
                  beginAtZero: false,
                  position: "right",
                },
                y3: {
                  beginAtZero: false,
                },
              },
            }}
          />
        </div>
      );
    });
  };

  return (
    <PasswordProtect>
      <div style={{ float: "left" }}>
        {tokensTracking && (
          <DropdownSearchMenu
            tokensTracking={tokensTracking}
            onTokenSelect={handleAddressClick}
          />
        )}
      </div>
      <br />
      <div>
        {loading && <p>Loading...</p>}
        {error && <p>{error}</p>}
        {!loading && data.length > 0 && chartData && (
          <>
            <div>
              <h3>Manage Moving Average Periods</h3>
              <div>
                <input
                  type="number"
                  value={newSmaPeriod}
                  onChange={(e) => setNewSmaPeriod(Number(e.target.value))}
                  placeholder="Enter new SMA period"
                />
                <input
                  type="number"
                  value={newEmaPeriod}
                  onChange={(e) => setNewEmaPeriod(Number(e.target.value))}
                  placeholder="Enter new EMA period"
                />
                <button onClick={handleAddPeriod}>Add Period</button>
              </div>
              <ul>
                {maPeriods.map(({ smaPeriod, emaPeriod }) => (
                  <li key={`${smaPeriod}-${emaPeriod}`}>
                    SMA: {smaPeriod} periods, {smaPeriod / 4} days | EMA:{" "}
                    {emaPeriod} periods, {emaPeriod / 4} days
                    <button
                      onClick={() => handleRemovePeriod(smaPeriod, emaPeriod)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ float: "right" }}>
              <button onClick={downloadCSV}>Download CSV</button>
              <button onClick={resetZoom}>Reset Zoom</button>
              {/* <button onClick={zoomIn}>Zoom In</button> */}
              {/* <button onClick={zoomOut}>Zoom Out</button> */}
            </div>

            {isClient && (
              <Bar
                ref={chartRef}
                data={chartData}
                options={{
                  animation: false,
                  scales: {
                    y1: {
                      beginAtZero: false,
                    },
                    y2: {
                      beginAtZero: false,
                      position: "right",
                    },
                    y3: {
                      beginAtZero: false,
                    },
                  },
                  // plugins: {
                  //   zoom: {
                  //     pan: {
                  //       enabled: true,
                  //       mode: "x",
                  //     },
                  //     zoom: {
                  //       //@ts-ignore
                  //       enabled: true,
                  //       mode: "x",
                  //       wheel: {
                  //         enabled: true,
                  //       },
                  //       pinch: {
                  //         enabled: true,
                  //       },
                  //       drag: {
                  //         enabled: true,
                  //       },
                  //     },
                  //   },
                  // },
                }}
              />
            )}
            {isClient && <BarChart data={chartData} />}
          </>
        )}
      </div>
    </PasswordProtect>
  );
}
