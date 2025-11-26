# Pulsarr
A lightweight automation service for Audiobookshelf. Pulsarr connects to the Audiobookshelf API, syncs your library, accepts magnet requests, sends downloads to Deluge with labels, and automatically imports completed audiobooks back into Audiobookshelf. Fully Dockerized and hands-free.


✔ Talks directly to Audiobookshelf’s API

<img src="screenshots/search-bar.png" width="600">

✔ Pulls your books list / library

<img src="screenshots/bookspage.png" width="600">


✔ Lets you request audiobooks → sends magnet links to Deluge

<img src="screenshots/bookpage.png" width="600">

✔ Applies the correct Deluge label

<img src="screenshots/importer.png" width="600">



✔ Moves finished downloads into the Audiobookshelf library folder

✔ Fully Dockerized


Update
I fixed Prowler and it works — just in time to find out that there are almost no audiobooks on the public torrent websites…

The New Plan
- I figured out how torrent magnets work.
- The websites where I get my audiobooks right now already include all the info needed to make them work, and you don’t need to log in.

So I’m going to make it use those sites by default. And if you have a semi-private torrent site that’s amazing for audiobooks, you can still use Prowlarr.







<a href="https://www.buymeacoffee.com/Eyonic" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

