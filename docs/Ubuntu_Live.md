Using Live Ubuntu on a USB drive is a quick way to get Monster In The Middle (MiTM) running. By default Ubuntu Live will not save any configuration changes between reboot. To enable persistent storage of configuration changes see the "Setup Ubuntu Live persistent storage" steps in this document.

## Summary

1. Create Ubuntu Live USB 
2. Boot Ubuntu Live
3. Connect to internet
4. Install arp/net-tools pre-requisite
5. Download MiTM
6. Unpack MiTM
7. Start MiTM

Optional Network Control steps:

8. Setup ip-forwarding
9. Scan network
10. Arpspoof to control network

Optional Persistent Storage steps:

1.  Setup Ubuntu Live persistent storage

## Details

1. Create Ubuntu Live USB drive  
Follow Ubuntu's instructions for [creating Ubuntu Live USB drive](https://ubuntu.com/tutorials/try-ubuntu-before-you-install) on your base system (Windows, Linux, OSX). Steps usually include:
    * Download [latest Ubuntu Desktop](https://ubuntu.com/download/desktop) iso
    * Use the application instructions recommend for mirroring iso to the USB drive (or dd)  
    * **NOTE**: If you intend to save configuration between reboot you should consider skipping to the instructions for setting up a Ubuntu Live persistent storage
2. Restart system and select USB as boot device. Key to interrupt normal boot will differ and be specific to your computer model. (e.g. F12 on Lenovo)
3. Connect Ubuntu host to internet through WiFi or Wired network
4. Install arp/net-tools  
After Ubuntu starts, open Terminal application and install arp using command: `sudo apt-get install net-tools`
5. Download the latest [MiTM release](https://github.com/nocompanyco/monsterinthemiddle/releases) file for Linux.
6. Unpack/unzip the downloaded file.  
This can be done through the Ubuntu File Manager application by right clicking on the file and choosing "Extract Here". When completed you should have a new directory created with the same name as the downloaded file without the 'tar.gz' ending, such as 'monsterinthemiddle-0.1.1-linux-x64'
7. start MiTM  
From Terminal application run:   
`sudo ~\Downloads\monsterinthemiddle-0.1.1-linux-x64\monsterinthemiddle --no-sandbox`  
The command assumes version 0.1.1 was downloaded and extracted within the Ubuntu users ~\Downloads directory.

At this point you can use MiTM to review the traffic coming to and from the MiTM host itself. To review traffic of other network hosts the follow "Network Control" steps.

## Optional Network Control steps

The following steps can be taken to trick other network hosts into assuming the MiTM host is the default router. This is done by impersonating the default router which involves sending ARP packets continuously to known hosts telling them that the MAC address of the default router IP is in-fact our MiTM hosts MAC address.

8. setup ip forwarding:   
`sudo sysctl -w net.ipv4.ip_forward=1`  
`sudo sysctl -w net.ipv6.ip_forward=1`  
This configures the MiTM host to transparently forward packets.
9. Scan network for hosts  
    * From MiTM file menu open the "Network scan and control" window
    * Click the 'Start' Scan hosts button. This will scan for new network hosts
10. Start Arpspoofer  
After additional network hosts appear in the "Discovered Hosts" list click the `Start` arp spoofing button

If everything works as planned you start to see network traffic from other hosts in the Devices and Packets monitor windows.

## Optional Persistent Storage steps

By default changes made to the Ubuntu Live USB instance will not be saved between reboots. Upon every reboot MiTM will need to be re-installed and configured. To save configuration a persistent storage can be configured. At the moment this has not been tested but you can try to follow [the instructions   found here](https://askubuntu.com/questions/1230902/what-is-the-correct-way-to-create-a-persistent-ubuntu-20-04-usb).

An easier way to quickly configure the system and run MiTM without setting up a persistent storage would be to use a second USB or SD card drive to store the MiTM application. The application can be extracted to the second drive and then executed from there drive. The net-tools prerequisite would have to be installed upon each reboot. To make this a bit easier the `.deb` file can be stored on the second drive and installed directly from the drive on each reboot: `apt-get download net-tools` to download deb to second drive. Then `sudo apt-get install {second drive}/net-tools*.deb` on each reboot to install net-tools requirement. 