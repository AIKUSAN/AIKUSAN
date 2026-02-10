import os
import sys
import json
import urllib.request
import urllib.error

# Configuration
OUTPUT_FILE = "pacman-contribution-graph.svg"
TOKEN = os.environ.get("GITHUB_TOKEN")
USERNAME = os.environ.get("GITHUB_USERNAME", "AIKUSAN")

# Dark Theme Colors (Transparency Optimized)
# Background is transparent (none)
DOT_COLORS = {
    0: "#21262d", # Empty cell
    1: "#0e4429", # Level 1
    2: "#006d32", 
    3: "#26a641", 
    4: "#39d353"  
}
PACMAN_COLOR = "#e8c13b"

def get_contributions():
    if not TOKEN:
        print("Error: GITHUB_TOKEN not set.")
        sys.exit(1)

    query = {
        "query": """
        query($userName:String!) {
          user(login: $userName) {
            contributionsCollection {
              contributionCalendar {
                weeks {
                  contributionDays {
                    contributionCount
                  }
                }
              }
            }
          }
        }
        """,
        "variables": {"userName": USERNAME}
    }

    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps(query).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "User-Agent": "PacmanGraphGenerator"
        }
    )

    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
    except urllib.error.URLError as e:
        print(f"API Request Failed: {e}")
        sys.exit(1)

    if 'errors' in data:
        print(f"GraphQL Error: {data['errors']}")
        sys.exit(1)

    try:
        return data['data']['user']['contributionsCollection']['contributionCalendar']['weeks']
    except (KeyError, TypeError):
        print("Error: Unexpected data structure from GitHub API")
        sys.exit(1)

def get_level(count):
    if count == 0: return 0
    if count <= 2: return 1
    if count <= 7: return 2
    if count <= 12: return 3
    return 4

def generate_svg(weeks):
    dot_radius = 2.5
    gap = 4
    cell_size = (dot_radius * 2) + gap
    
    width = len(weeks) * cell_size + 20
    height = 7 * cell_size + 20
    
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<style>.pacman {{ fill: {PACMAN_COLOR}; }}</style>'
    ]
    
    path_points = []
    
    # Generate Grid
    for w_i, week in enumerate(weeks):
        days = week['contributionDays']
        is_even_col = (w_i % 2 == 0)
        
        for d_i, day in enumerate(days): # Always 0 to 6
            cx = 10 + w_i * cell_size + cell_size/2
            cy = 10 + d_i * cell_size + cell_size/2
            
            count = day['contributionCount']
            color = DOT_COLORS[get_level(count)]
            
            # Animation Timing setup
            if is_even_col:
                path_idx = w_i * 7 + d_i
            else:
                path_idx = w_i * 7 + (len(days) - 1 - d_i)
                
            anim_delay = path_idx * 0.03
            
            svg.append(
                f'<circle cx="{cx}" cy="{cy}" r="{dot_radius}" fill="{color}">'
                f'<animate attributeName="opacity" from="1" to="0" begin="{anim_delay:.2f}s" dur="0.1s" fill="freeze" />'
                f'</circle>'
            )

    # Generate Pacman Path
    for w_i, week in enumerate(weeks):
        days = week['contributionDays']
        is_even_col = (w_i % 2 == 0)
        day_indices = range(len(days)) if is_even_col else range(len(days)-1, -1, -1)
        for d_i in day_indices:
            cx = 10 + w_i * cell_size + cell_size/2
            cy = 10 + d_i * cell_size + cell_size/2
            path_points.append(f"{cx},{cy}")

    if path_points:
        path_d = "M" + " L".join(path_points)
        total_dur = len(path_points) * 0.03
        svg.append(
            f'<circle r="{dot_radius + 2}" class="pacman">'
            f'<animateMotion dur="{total_dur:.2f}s" repeatCount="indefinite" path="{path_d}" />'
            f'</circle>'
        )
        
    svg.append('</svg>')
    
    with open(OUTPUT_FILE, 'w') as f:
        f.write("".join(svg))
    print(f"Generated {OUTPUT_FILE}")

if __name__ == "__main__":
    weeks = get_contributions()
    generate_svg(weeks)
