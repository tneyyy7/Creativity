import os
from PIL import Image, ImageDraw

def make_squircle_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask

def main():
    # We restore the ORIGINAL loved visual which is cached in the brain directory
    src_path = "/Users/eugenebovsunovsky/.gemini/antigravity-ide/brain/f824b7ab-9c49-498a-9499-69ef0f142982/vibrant_glass_avatar_1780145169717.png"
    dest_path_icon = "/Users/eugenebovsunovsky/Desktop/Agents/Creativity/public/avatar_icon.png"
    dest_path_apple = "/Users/eugenebovsunovsky/Desktop/Agents/Creativity/public/avatar_apple.png"
    
    if not os.path.exists(src_path):
        print(f"Source file not found: {src_path}")
        return

    # Load original image containing the gorgeous glass swirl
    img = Image.open(src_path).convert("RGBA")
    
    # Precise bounding box coordinates to capture the original icon in its entirety (including the bottom edge)
    left = 160
    top = 155
    right = 865
    bottom = 905
    
    w = right - left # 705
    h = bottom - top # 750
    print(f"Slicing original beloved icon with dimensions: {w}x{h}")
    
    # 1. Crop the original icon
    icon_cropped = img.crop((left, top, right, bottom))
    
    # 2. Resize it directly to fill the entire 1024x1024 square canvas.
    # This eliminates outer transparent margins completely, makes the logo perfectly square,
    # and stretches it to standard high-resolution Apple proportions with all margins equal (0 padding).
    icon_square = icon_cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # 3. Create a standard Apple iOS squircle mask covering 100% of the 1024x1024 canvas
    # Corner radius = 22.37% of 1024 = 229 pixels
    radius = int(1024 * 0.2237)
    print(f"Creating perfect 1024x1024 squircle mask with corner radius {radius}...")
    mask = make_squircle_mask((1024, 1024), radius)
    
    # 4. Paste the squared original icon using the transparency mask
    final_img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    final_img.paste(icon_square, (0, 0), mask=mask)
    
    # 5. Overwrite the files with the restored, perfectly-fitted original logo
    final_img.save(dest_path_icon, "PNG")
    final_img.save(dest_path_apple, "PNG")
    print("Symmetric Apple-style transparent icon restored successfully from original image!")

if __name__ == "__main__":
    main()
