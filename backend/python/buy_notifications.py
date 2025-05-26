import asyncio
import asyncpg
import pandas as pd
from datetime import datetime
import json
import httpx
import sys
# Going to have to figure out batching
# And getting rid of massive tokens by token address

pd.set_option('display.max_rows', 100)  # or set a number large enough
pd.set_option('display.max_columns', 300)  # or set a number large enough
pd.set_option('display.width', 500)  # adjust as per the width of your terminal

async def get_segment_data():
    conn = await asyncpg.connect('')
    query = f"""
        SELECT
            address,
            end_time,
            whale_wallet_net_z,
            end_price,
            whale_wallet_percent,
            whale_bulls,
            period,
            token_buy_volume,
            token_sell_volume,
            new_trader_tokens_bought_48h,
            new_trader_tokens_sold_48h
        FROM
            segments
        ORDER BY
            end_time ASC;
    """
    rows = await conn.fetch(query)
    await conn.close()
    return pd.DataFrame(rows, columns=['address', 'end_time', 'whale_wallet_net_z', 'end_price', 'whale_wallet_percent', 'whale_bulls', 'period', 'token_buy_volume',
            'token_sell_volume', 'new_trader_tokens_bought_48h', 'new_trader_tokens_sold_48h'])

def prepare_data(data):
    # Group by 'address' and then apply the rolling mean calculation to each group
    data['rolling_mean'] = data.groupby('address')['end_price'].rolling(window=4, min_periods=1).mean().reset_index(level=0, drop=True)
    # Calculate the percentage difference between the current price and the rolling mean within each address group
    data['price_vs_4_prev_periods'] = ((data['end_price'] - data['rolling_mean']) / data['rolling_mean']) * 100
    # Optionally, format the percentage difference to two decimal places
    data['price_vs_4_prev_periods'] = data['price_vs_4_prev_periods'].map(lambda x: f"{x:.2f}")

    data['net_tokens'] = data['token_buy_volume'] - data['token_sell_volume']
    data['net_tokens_new_trader'] = data['new_trader_tokens_bought_48h'] - data['new_trader_tokens_sold_48h']

    data['seven_day_ma_net_tokens'] = data.groupby('address')['net_tokens'].rolling(window=28, min_periods=8).mean().reset_index(level=0, drop=True)
    data['seven_day_ma_net_tokens_pct_change'] = data.groupby('address')['seven_day_ma_net_tokens'].pct_change(periods=4) * 100
    data['new_trader_tokens_pct_change'] = data.groupby('address')['net_tokens_new_trader'].pct_change(periods=1) * 100
    
    data['token_buy_volume_pct_change'] = data.groupby('address')['token_buy_volume'].pct_change(periods=4) * 100

    return data


def calculate_picks(data, type):
    # Filter picks based on conditions
    # picks = data[(data['whale_wallet_net_z'] > 1.5) & (data['price_vs_4_prev_periods'].astype(float) < 0)]
    # picks = data[(data['whale_wallet_net_z'] > 1) & (data['whale_wallet_percent'].astype(float) > .01)]
    # picks = data[(data['whale_wallet_net_z'] > 1) & (data['whale_wallet_percent'].astype(float) > .014) ]
                #  & ((data['price_vs_4_prev_periods'].astype(float) > 20) | (data['price_vs_4_prev_periods'].astype(float) < -20))]    # picks = data[(data['whale_wallet_net_z'] < 0)]
    picks = None

    if type == 'any':
        picks = data
    
    if type == 'strict':
        picks = data[(data['whale_wallet_net_z'] > 1) & (data['whale_wallet_percent'].astype(float) > .014) & ((data['price_vs_4_prev_periods'].astype(float) > 15) | (data['price_vs_4_prev_periods'].astype(float) < -15))]    # picks = data[(data['whale_wallet_net_z'] < 0)]

    if type == 'relaxed':
        picks = data[(data['whale_wallet_net_z'] > 1) & (data['whale_wallet_percent'].astype(float) > .014)]
    
    if type == 'token_buy_jump':
        picks = data[(data['token_buy_volume_pct_change'] > 250)]

    if type == 'seven_day_ma_net_tokens_pct_change_22':
        picks = data[(data['seven_day_ma_net_tokens_pct_change'] > 22) & (data['net_tokens'] > 0)]


    if type == 'combo-strict':
        picks = data[(data['seven_day_ma_net_tokens_pct_change'] > 17) & 
             (data['net_tokens'] > 0) & 
             (data['whale_wallet_net_z'] > 1) & 
             (data['whale_wallet_percent'].astype(float) > .014) & 
             ((data['price_vs_4_prev_periods'].astype(float) > 15) | 
              (data['price_vs_4_prev_periods'].astype(float) < -15)) &
             (data['new_trader_tokens_pct_change'] > 50) & 
             (data['net_tokens_new_trader'] > 0)]
        # remove last two for the goods

    if type == 'combo-relaxed':
        picks = data[(data['seven_day_ma_net_tokens_pct_change'] > 22) & 
             (data['net_tokens'] > 0) & 
             (data['whale_wallet_net_z'] > 1) & 
             (data['whale_wallet_percent'].astype(float) > .014) ]
        
    if type == 'combo-neg':
        picks = data[(data['seven_day_ma_net_tokens_pct_change'] > 22) & 
             (data['net_tokens'] > 0) & 
             ((data['price_vs_4_prev_periods'].astype(float) > 20) | 
              (data['price_vs_4_prev_periods'].astype(float) < -20))]

    if type == 'new-trader':
        picks = data[(data['new_trader_tokens_pct_change'] > 800) & (data['net_tokens_new_trader'] > 0)]

    # Initialize an empty DataFrame for pick details
    pick_details = pd.DataFrame(columns=['address', 'end_price', 'human_translated_end_time', 'price_vs_4_prev_periods', 
                                         'whale_wallet_net_z', 'percentage_high_after', 'percentage_low_after', 
                                         'percentage_high_before', 'percentage_low_before', 'whale_wallet_percent', 'whale_bulls'])

    # Check if any arguments were passed
    if len(sys.argv) > 1:
        # sys.argv[0] is the script name itself, sys.argv[1] would be the first argument passed
        first_argument = sys.argv[1]
        print("Received argument:", first_argument)
    else:
        print("No arguments received.")

    for index, row in picks.iterrows():
        current_time = row['end_time']

        if current_time < int(sys.argv[1]):

            continue

        current_address = row['address']
        current_price = row['end_price']
        current_whale_volume = row['whale_wallet_percent']
        current_whale_bulls = row['whale_bulls']

        # Data subsets for after and before the current end_time for the current address
        after_data = data[(data['address'] == current_address) & (data['end_time'] > current_time)]
        before_data = data[(data['address'] == current_address) & (data['end_time'] < current_time)]

        # Max and min end_price after the current end_time
        high_after = after_data['end_price'].max() if not after_data.empty else None
        low_after = after_data['end_price'].min() if not after_data.empty else None

        # Max and min end_price before the current end_time
        high_before = before_data['end_price'].max() if not before_data.empty else None
        low_before = before_data['end_price'].min() if not before_data.empty else None

        # Calculate percentage changes relative to the current end_price
        percentage_high_after = ((high_after - current_price) / current_price * 100) if high_after is not None else None
        percentage_low_after = ((low_after - current_price) / current_price * 100) if low_after is not None else None
        percentage_high_before = ((high_before - current_price) / current_price * 100) if high_before is not None else None
        percentage_low_before = ((low_before - current_price) / current_price * 100) if low_before is not None else None

    
        # Human-readable end time
        human_time = datetime.utcfromtimestamp(current_time).strftime('%Y-%m-%d %H:%M:%S')

        print(current_address, human_time)
        # Append new row to pick_details DataFrame
        new_row = pd.DataFrame({
            'address': [current_address],
            'end_price': [current_price],
            'human_translated_end_time': [human_time],
            'price_vs_4_prev_periods': [row['price_vs_4_prev_periods']],
            'whale_wallet_net_z': [row['whale_wallet_net_z']],
            'percentage_high_after': [percentage_high_after],
            'percentage_low_after': [percentage_low_after],
            'percentage_high_before': [percentage_high_before],
            'percentage_low_before': [percentage_low_before],
            'whale_wallet_percent': [current_whale_volume],
            'whale_bulls': [current_whale_bulls],
            'unix': [current_time],
            'period': [row['period']]
        })

        # Concatenate the new row to the DataFrame
        pick_details = pd.concat([pick_details, new_row], ignore_index=True)

    return pick_details

async def discord_notif(picks, webhook_url):
    async with httpx.AsyncClient() as client:
        for idx, pick in picks.iterrows():
            # Create the message content for each pick
            message_content = {
                "content": (
                    f"-----------Possible Buy---------\n"
                    f"[Dexscreener {pick['address']}](https://dexscreener.com/search?q={pick['address']})\n"  # Add your link here
                    f"{pick['address']}\n"  # Add your link here
                    f"Time of Pick: {pick['human_translated_end_time']} UTC\n"
                    F"Price: {pick['end_price']}\n"
                    f"--------------------"
                )
            }
            # Convert the JSON payload to a string and include it under the 'payload_json' key
            data = {
                'payload_json': json.dumps(message_content)
            }
            await client.post(
                webhook_url,
                data=data,
            )

async def insert_indicators_to_db(picks, method):
    conn = await asyncpg.connect('')

    async with conn.transaction():
        for _, pick in picks.iterrows():
            token_address = pick['address']
            period = pick['period']
            created_at = int(datetime.utcnow().timestamp())
            block_unix_timestamp = int(pick['unix'])
            price_at_prediction = pick['end_price']
            max_price_after_percentage = pick['percentage_high_after']
            if pd.isna(max_price_after_percentage):
                max_price_after_percentage = None
            min_price_after_percentage = pick['percentage_low_after']
            if pd.isna(min_price_after_percentage):
                min_price_after_percentage = None        
            side = 'buy'

            # Logging the data that will be inserted

            await conn.execute('''
                INSERT INTO indicators (token_address, method, period, created_at, block_unix_timestamp, price_at_prediction, 
                                   max_price_after_percentage, min_price_after_percentage, side)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ''', token_address, method, period, created_at, block_unix_timestamp, price_at_prediction, max_price_after_percentage, min_price_after_percentage, side)
    await conn.close()


def sell_signals(data, buy_indicators, type = 'lowq-whales'):    
    for _, buy_indicator in buy_indicators.iterrows():
        # get data after the buy_indicator unix
        data_after_buy = data.loc[(data['end_time'] > int(buy_indicator['unix'])) & (data['address'] == buy_indicator['address'])].copy()
        
        # create a new column for the previous net_tokens
        data_after_buy.loc[:, 'prev_net_tokens'] = data_after_buy['net_tokens'].shift(1)
        
        # check for an instance where the net_tokens is 50% more than the last net_tokens and end_price is 50% more than the buy_indicator end_price
        sell_condition = data_after_buy[(data_after_buy['net_tokens'] > 22 * data_after_buy['prev_net_tokens']) & (data_after_buy['end_price'] > 1.5 * buy_indicator['end_price'])]
        
        print(f"Buy signal for {buy_indicator['address']} at unix {buy_indicator['unix']} at {buy_indicator['end_price']}")
        # print a signal where this occurs
        for index, row in sell_condition.iterrows():
            print(f"Sell signal for {row['address']} at unix {row['end_time']} at {row['end_price']}")

    return
async def main():
    data = await get_segment_data()
    data = prepare_data(data)

    # Calculate picks and their details
    # pick_data = calculate_picks(data)
    # strict = calculate_picks(data, 'strict')
    # await discord_notif(strict, 'https://discord.com/api/webhooks/1239637004312907898/y6B3uf4FnvjQvCz6NAQdBOGpOLz7jz1v-5t8qTEi2K1n4vRXpcfrzjn9abrbxHxdhX13')
    # await discord_notif(strict, 'https://discord.com/api/webhooks/1239665733529501726/3A_inLXvHsmXRF4D8XdhMkFLVUWsE4cwJho8bIvIo4OT_G6ITZBrKy70-nrZ6uVmclia')
   
    # print(f"First element of strict: {strict.iloc[0]}, type: {type(strict.iloc[0])}")

   
    # relaxed = calculate_picks(data, 'relaxed')
    # await discord_notif(relaxed, 'https://discord.com/api/webhooks/1239642948014968884/Qj8mXeOoHMaV0hhLFi-ZmxpW5f2FM_6rxlm2ZD3fvHLw6gomy6AtqFVUuzYd_0W1Ny7M')
    # await discord_notif(relaxed, 'https://discord.com/api/webhooks/1239666073339691038/N2iJYu52aUsHikxJ29QX6Km8MvIV0jWgtKOL1upSdPuic_K1iN10znbBvYqhYR-0YSzw')
    

    # await insert_indicators_to_db(strict, "whale-strict")
   
    # Save to CSV
    # strict.to_csv('strict_1.csv', index=False)
    # print("Picks data saved to 'picks_1.csv'.")

    buy_indicators = calculate_picks(data, 'strict')

    # Calculate the average percentage_high_after and percentage_low_after
    avg_percentage_high_after = buy_indicators['percentage_high_after'].mean()
    avg_percentage_low_after = buy_indicators['percentage_low_after'].mean()

    # sells = sell_signals(data, buy_indicators)
    # print(buy_indicators)
    # Log the averages
    print(f"Average percentage_high_after: {avg_percentage_high_after}")
    print(f"Average percentage_low_after: {avg_percentage_low_after}")
    
    # print(relaxed)
    # buy_indicators.to_csv('combo.csv', index=False)
    # await insert_indicators_to_db(buy_indicators, "combo")




# Run the main function
if __name__ == "__main__":
    asyncio.run(main())

    # 