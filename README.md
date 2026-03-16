# 📱 WhatsApp Bulk Message Sender

This extension lets you send automated, personalized bulk messages to contacts in your Excel list via WhatsApp Web. Its modern UI and privacy features improve your WhatsApp experience.

![Logo](icon.png)

## 🚀 Features

- **Excel Bulk Sending**: Upload contact lists in `.xlsx` format.
- **Personalized Messages**: Use `{FirstName}`, `{LastName}`, and `{Salutation}` to create unique messages for each person. (Turkish placeholders `{Ad}`, `{Soyad}`, `{Hitap}` are also supported.)
- **Tag Filtering**: Send messages based on tags in the Excel file.
- **Privacy Mode**: Blur your chat list and/or the active chat content with one click. Ideal for taking screenshots or working in public.
- **Quick Access**: Toggle privacy mode instantly by clicking the **Eye icon** in the WhatsApp header (next to the New Chat button).
- **Native UI**: A modern design that matches WhatsApp Web's Light/Dark themes.
- **Smart Delays**: Random waits between messages to reduce spam detection risk.

## 📦 Installation

1. Download the **`WhatsappSender_v1.0.zip`** (or `.rar`) file from GitHub.
2. Extract the archive into a folder, e.g., `Documents\WhatsappSender`.
3. Open **Google Chrome**.
4. Go to `chrome://extensions/`.
5. Enable **Developer Mode** in the top-right corner.
6. Click **Load unpacked** in the top-left corner.
7. Select the extracted folder.
8. Done! When you open WhatsApp Web, the panel will appear automatically.

## 📖 User Guide

### 1. Preparing the Excel File
Your Excel headers should follow this format:

| Number | FirstName | LastName | Salutation | Tag1 |
| :--- | :--- | :--- | :--- | :--- |
| 5321234567 | Ahmet | Yilmaz | Mr. | Customer |

Turkish headers are also supported:

| Numara | Ad | Soyad | Hitap | Etiket1 |
| :--- | :--- | :--- | :--- | :--- |
| 5321234567 | Ahmet | Yilmaz | Bey | Musteri |

### 2. Sending Messages

1. Open **WhatsApp Web** (`web.whatsapp.com`).
2. You will see the extension panel on the left.
3. Click **Choose File** and upload your Excel file.
4. Select your target **Tag**.
5. Write your message. Click the `{FirstName}` / `{LastName}` / `{Salutation}` buttons to insert variables.
6. Click **START** and relax!

### ⚙️ Settings

Under **Advanced Settings**:
- **Privacy Mode (Blur)**: Master toggle for privacy mode. You can also toggle it from the eye icon in the WhatsApp header.
- **Blur chat list**: Blurs the left chat list (names, previews, photos). It becomes clear on hover.
- **Blur chat content**: Blurs the active chat (texts, images, audio, documents). It becomes clear on hover.

## ⚠️ Warning

This software is for educational and personal use only. Users are responsible for complying with WhatsApp's terms of service. Sending too fast or too many messages can result in account restrictions. Keep the **Sending Speed** settings at reasonable levels.

---
**Developer**: DA Studios
