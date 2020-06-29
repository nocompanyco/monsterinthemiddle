# Network Setup

To examine or control the network traffic of other hosts the computer that runs the Monster In The Middle software (MiTM) must be 
set as the default router for the entire network. This can be achieved by reconfiguring the network WiFi router to tell all hosts that the MiTM host is the default gateway (see **Modified WiFi** section), or by configuring the MiTM host as a Hotspot (see **Using Hotspot** section), or alternatively the "Network scan and control" window in MiTM provides a Arpspoofer that can be used to impersonate the default router without any changes to the network configuration (see **Using Arpspoof**). 


## Using Arpspoof

Using arpspoof to take control of network traffic is a beta feature that attempts to take control of the network hosts without any network reconfiguration changes required. It is possible that using this method some packets loss may occur and if this is a problem then the more complex Modified WiFi option should be used instead.

* Open the "Network scan and control" window from the file menu in the MiTM application
* Press Start for the network scanner.
* Wait for some additional hosts to appear in the "Discovered Hosts" list. This could take up to 20 seconds
* Press Start for the Arpspoofer
* Configure the MiTM host to act as a router
  * On Linux from Terminal run:  
    `sudo sysctl -w net.ipv4.ip_forward=1`  
    `sudo sysctl -w net.ipv6.ip_forward=1`  
  * On OSX from Terminal run (or try Internet Sharing):  
    `sudo sysctl -w net.inet.ip.forwarding=1`
  * On Windows: see [Microsoft instructions](https://answers.microsoft.com/en-us/windows/forum/windows_10-networking/internet-connection-sharing-in-windows-10/f6dcac4b-5203-4c98-8cf2-dcac86d98fb9) or [discussion](https://serverfault.com/questions/929081/how-can-i-enable-packet-forwarding-on-windows)
    - Check if forwarding enabled from cmd prompt: `netsh interface ipv4 show interface {INTERVACE}`
    - Change `IPEnableRouter` reg key `HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters`. Create it (REG_DWORD) if not already created.
* You should now see additional host traffic appear in the Packets and Devices monitor windows

## Using Hotspot (untested)

By setting the MiTM as a hotspot all other network hosts will connect to the MiTM host directly and use it as their default router. The procedures to configure a hotspot are different per host and we only recommend this for Windows or OSX.

* OSX use the Internet Sharing settings dialog. See [OSX Instructions](https://support.apple.com/guide/macbook-air/instant-hotspot-apdae69c81f1/mac)
* Windows use [Microsofts Hotspot instructions](https://support.microsoft.com/en-us/help/4027762/windows-use-your-pc-as-a-mobile-hotspot)
* Linux: you can try [Ubuntu's Hotspot instructions](https://help.ubuntu.com/stable/ubuntu-help/net-wireless-adhoc.html.en)

## Modified WiFi (untested)

By modifying the WiFi router configuration we can force all hosts that join the network to use the MiTM host as their default router. The MiTM host itself will use the original WiFi router and must be configured to use NAT to forward packets of other hosts.

You will need to configure the MiTM host to act as a full router with DNS, NAT and DHCP capabilities. This is typically provided through [Internet Sharing settings on OSX](https://support.apple.com/guide/mac-help/share-internet-connection-mac-network-users-mchlp1540/mac) or [Internet sharing settings on Windows](https://answers.microsoft.com/en-us/windows/forum/windows_10-networking/internet-connection-sharing-in-windows-10/f6dcac4b-5203-4c98-8cf2-dcac86d98fb9).

For Linux find internet sharing instructions for your distribution (e.g. [Ubuntu](https://help.ubuntu.com/community/Internet/ConnectionSharing)) or alternatively use the following steps:
* install `ufw`
* install `net-tools`
* install `dnsmasq`
* Get `dhcpserver.sh`: https://gist.github.com/cyphunk/eb8cbfef47981f59e428bb77e070d2d1
* Run dhcpserver.sh: `./dhcpserver.sh {NETWORK_INTERFACE} 1`  
  (Change the network interface of MiTM host that is connected to the WiFi router)