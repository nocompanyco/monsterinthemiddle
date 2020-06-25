# monsterinthemiddle

Monster In The Middle is a network analyzer in the early stages of development. Development is supported by [ISCProject](https://www.iscproject.org/).  This is currently not intended for public use. Application is intended for educational purposes only.

**TABLE OF CONTENTS**
* [Prerequisites](#prerequisites)
* [Install](#install)
* [Use](#use)
* [Development and Testing](#development-and-testing)

## Prerequisites

Download and install [Wireshark](https://www.wireshark.org/#download) regardless of platform. In general once you are able to execute wireshark with your user it should be possible to install and run Monster In The Middle. 

**Windows**: Install [Wireshark](https://www.wireshark.org/#download). When NPcap asks if you want to restrict network monitoring to administrators only, choose no and to allow all users to monitor network. (without setting this you will have to execute Monster In The Middle with administrator privileges)

**Linux**: Either run application as root or modify permissions as instructed in the linux section of [User Permissions](https://github.com/nocompanyco/monsterinthemiddle/wiki/User-Permissions) wiki page. This involves running setcap on binary and changing system ld.so.conf.

**OSX**: Either run application as root or modify permissions as shown in [User Permissions](https://github.com/nocompanyco/monsterinthemiddle/wiki/User-Permissions) wiki page. This is much simpler and just involves chmod on the network device. 

## Install

Download from the [releases page](https://github.com/nocompanyco/monsterinthemiddle/releases) the Linux, OSX or Windows binaries. Current Windows releases are not as thoroughly tested so please report any issues you run into.

## Use

[![settings](./docs/1_settings_sm.png)](./docs/1_settings.png)[![settings](./docs/2_devices_sm.png)](./docs/2_devices.png)

1. Settings (first image above): The application will start and show the configuration dialog where user selects the network interface. The interface name and default gateway IP address should be defined by user. These values can be determined by selecting a network interface from the drop down menu or entering the network interface name found from the operating system settings.

2. Devices Monitor (second image above): routinely shows a list of devices found on the network and recent websites and images accessed. This view is shown after the settings dialog. It can also be accessed through the MiTM menu.

3. Packets Monitor (first image below): shows detailed information on individual packets found on network. Currently only known protocols of HTTP, HTTPS, IMAP, POP, SMTP and DNS are shown.

4. Network scan and control (second image below): can be used to scan the network for hosts and forcefully reroute their traffic through the MiTM host using arpspoofing. Click the "**Start**" Host Scanner button to begin collecting network IP addresses. This will scan is limited to scanning for only the 254 IP's within the same class C of the MiTM hosts IP address (e.g. 192.168.1.1 to 192.168.1.254). Once some hosts are list they can be forcefully routed through the monitoring MiTM host by click the "**Start**" Arpspoofing. Aprspoofing has been tested and confirmed to work on OSX and Linux but has not been thoroughly tested on winodws. Also aprspoof is not a full-proof capture method and may not capture all traffic. An alternative to capturing traffic through Arpspoofing is to run MiTM on a host that is acting as the default router for all network clients. 

[![settings](./docs/3_packets_sm.png)](./docs/3_packets.png)[![settings](./docs/4_scan_sm.png)](./docs/4_scan.png)


## Development and Testing

### Using Repository

Install electron UI version:

    npm install
    npm run rebuild_electron
    npm run start_electron

Install console only version, for debugging:

    npm install
    npm rebuild
    npm run start_node

On console each ui element can be executed and tested without electron, using a chrome browser instead:

    node packet.js <network_interface> "tcp or udp" <default_gateway_ip>
    http://localhost:8080

    node devices.js
    http://localhost:8081

    node arpspoof.js --eth <network_interface> --gateway <default_gateway_ip>
    http://localhost:8083

## Build Installation Packages

    npm install

    ON OSX:
    npm run dist:mac

    ON LINUX:
    npm run dist:linux

    ON WINDOWS:
    npm run dist:windows

Find binary packages created in dist directory
