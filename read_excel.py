import pandas as pd
import json

try:
    df = pd.read_excel('CONTRATOS 2025 - REV03 - Online.xlsx', nrows=5)
    cols = list(df.columns)
    first_row = df.iloc[0].to_dict()
    # Handle NaN values for JSON serialization
    import math
    for k, v in first_row.items():
        if isinstance(v, float) and math.isnan(v):
            first_row[k] = None
    
    with open('output.json', 'w', encoding='utf-8') as f:
        json.dump({'columns': cols, 'first_row': first_row}, f, indent=2, ensure_ascii=False)
except Exception as e:
    with open('output.json', 'w', encoding='utf-8') as f:
        json.dump({'error': str(e)}, f)
