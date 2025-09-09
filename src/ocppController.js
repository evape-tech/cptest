const db = require('../models')
const Order = db.Order
const OrderItem = db.OrderItem
const Cart = db.Cart
const Payment = db.Payment
const Cp_log = db.Cp_log
const Cp_gun_data = db.Cp_gun_data
const Gun = db.Gun
const nodeMailer = require('../utils/nodemailer')
const mpgData = require('../utils/mpgData')
const axios = require('axios')
const ecpay_payment = require('ecpay_aio_nodejs')
const util = require('util')
const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors')
var mqtt = require('mqtt');
var mqtt_client=mqtt.connect('mqtt://rcu.dq1.tw');
//mqtt_client.subscribe('/benson_csms_mqtt_all/');
const app = new express();
expressWs(app);
const wsClients = {}
const wsCpdatas={}
//app.wsClients = wsClients;
//const express = require('express')
//const route = express.Router() // 实例化路由对象

//ocpp var
var idtag_id="wang1234"
var trans_id=0
var ocpp_id_send="408";

//////////////////////////////////////////////////******************************
//////////////////////////////////////////////////******************************
var sim_mode = 1 //if 1 = sim mode, 0 = normal mode
/////////////////////
let nIntervId;
var sim_data1=0.00
var sim_data2=0.00
//


var cpid="1002";
var cp_online="online"
var cp_current_status="Available"
var cp_data1='0.00'
var cp_data2='0.00'
var cp_data3='0.0'
var cp_data4=''
var cp_data5=''
var cp_data6=''

var before_status = "Available";

mqtt_client.on('message',function(topic,msg)
{
    console.log('mqtt topic:'+topic);
    console.log('mqtt msg:'+msg);
})

async function read_data(){
    const rdsn = await Order.findOne({ where: { id : 1 } })
    console.log("read_rdsn="+JSON.stringify(rdsn));
    return rdsn;
}

async function update_guns_status(gun_cpsn,gun_connector,gun_status){
    console.log("update_guns_status");

    const gun_cpid = await Gun.findOne({ where: { cpsn : gun_cpsn, connector : gun_connector } })
    var now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
    console.log("gun_cpid="+JSON.stringify(gun_cpid));
    if(gun_cpid !== null){
        console.log("find gun_cpid !!!!!! into gun_cpid.update()");
        await gun_cpid.update({
            guns_status:gun_status,
            guns_memo2:now_time
        })
        if(gun_connector =="1"){
            await send_cp_to_kw_api(gun_cpid.cpid,gun_status,gun_cpid.guns_metervalue1,gun_cpid.guns_metervalue2,gun_cpid.guns_metervalue3,gun_cpid.guns_metervalue4,gun_cpid.guns_metervalue5,gun_cpid.guns_metervalue6)
        }
        if(gun_connector =="2"){
            await send_cp_to_kw_api(gun_cpid.cpid,gun_status,gun_cpid.guns_metervalue1,gun_cpid.guns_metervalue2,gun_cpid.guns_metervalue3,gun_cpid.guns_metervalue4,gun_cpid.guns_metervalue5,gun_cpid.guns_metervalue6)
        }
    }
    else{
        console.log("gun_cpid not find == null!!!!!");

    }



    return 0;
}


async function cpid_mapping(gun_cpsn,gun_connector){
    const gun_cpid = await Gun.findOne({ where: { cpsn : gun_cpsn, connector : gun_connector } })

    if(gun_cpid !== null){
        console.log("find gun_cpid !!!!!! into cpid_mapping");
        if(gun_connector==1){
            wsCpdatas[gun_cpsn][0].connector_1_meter.cpid_mapping = gun_cpid.cpid
            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[gun_cpsn][0]));

        }
        if(gun_connector==2){
            wsCpdatas[gun_cpsn][0].connector_2_meter.cpid_mapping = gun_cpid.cpid
            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[gun_cpsn][0]));

        }
    }
    else{
        console.log("gun_cpid not find == null!!!!!");

    }




    return 0;
}


async function update_guns_meters(gun_cpsn,gun_connector,gun_data1,gun_data2,gun_data3,gun_data4){
    console.log("into update_guns_meters()");
    const gun_cpid = await Gun.findOne({ where: { cpsn : gun_cpsn, connector : gun_connector } })
    var now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()

    if(gun_cpid !== null){

        if(gun_data1 != gun_cpid.guns_metervalue1){
            console.log("before metervalues1 ="+gun_cpid.guns_metervalue1+"new is="+gun_data1);

            if(gun_cpid.guns_metervalue5==null || gun_cpid.guns_metervalue6==null){
                console.log("!!!!! data5 or data6 == null!!!!!");
                if(gun_cpid.guns_metervalue5==null){
                    gun_cpid.guns_metervalue5 = "";
                    await gun_cpid.update({
                        guns_metervalue1:gun_data1,
                        guns_metervalue2:gun_data2,
                        guns_metervalue3:gun_data3,
                        guns_metervalue4:gun_data4,
                        guns_metervalue5:"0.00",
                        guns_memo2:now_time
                    })
                }
                if(gun_cpid.guns_metervalue6==null){
                    gun_cpid.guns_metervalue6 = "";
                    await gun_cpid.update({
                        guns_metervalue1:gun_data1,
                        guns_metervalue2:gun_data2,
                        guns_metervalue3:gun_data3,
                        guns_metervalue4:gun_data4,
                        guns_metervalue6:"0.00",
                        guns_memo2:now_time
                    })
                }
            }
            else{
                await gun_cpid.update({
                    guns_metervalue1:gun_data1,
                    guns_metervalue2:gun_data2,
                    guns_metervalue3:gun_data3,
                    guns_metervalue4:gun_data4,

                    guns_memo2:now_time
                })
            }
            if(gun_connector =="1"){
                await send_cp_to_kw_api(gun_cpid.cpid,gun_cpid.guns_status,gun_data1,gun_data2,gun_data3,gun_cpid.guns_metervalue4,gun_cpid.guns_metervalue5,gun_cpid.guns_metervalue6)
            }
            if(gun_connector =="2"){
                await send_cp_to_kw_api(gun_cpid.cpid,gun_cpid.guns_status,gun_data1,gun_data2,gun_data3,gun_cpid.guns_metervalue4,gun_cpid.guns_metervalue5,gun_cpid.guns_metervalue6)

            }
        }else{
            console.log("same data !!!!! - so no update them  => before metervalues1 ="+gun_cpid.guns_metervalue1+"new is="+gun_data1);
            if(gun_cpid.guns_metervalue5==null || gun_cpid.guns_metervalue6==null){
                console.log("!!!!! data5 or data6 == null!!!!!");
                if(gun_cpid.guns_metervalue5==null){
                    gun_cpid.guns_metervalue5 = "";
                    await gun_cpid.update({
                        guns_metervalue1:gun_data1,
                        guns_metervalue2:gun_data2,
                        guns_metervalue3:gun_data3,
                        guns_metervalue4:gun_data4,
                        guns_metervalue5:"0.00",
                        guns_memo2:now_time
                    })
                }
                if(gun_cpid.guns_metervalue6==null){
                    gun_cpid.guns_metervalue6 = "";
                    await gun_cpid.update({
                        guns_metervalue1:gun_data1,
                        guns_metervalue2:gun_data2,
                        guns_metervalue3:gun_data3,
                        guns_metervalue4:gun_data4,
                        guns_metervalue6:"0.00",
                        guns_memo2:now_time
                    })
                }
            }else{
                await gun_cpid.update({
                    guns_metervalue1:gun_data1,
                    guns_metervalue2:gun_data2,
                    guns_metervalue3:gun_data3,
                    guns_metervalue4:gun_data4,
                    guns_memo2:now_time
                })
            }
            //    if(gun_connector =="1"){
            //    await send_cp_to_kw_api(gun_cpid.cpid,gun_cpid.guns_status,gun_data1,gun_data2,gun_data3,gun_cpid.guns_metervalue4,gun_cpid.guns_metervalue5,gun_cpid.guns_metervalue6)
            //    }

        }
    }
    else{
        console.log("gun_cpid not find == null!!!!!");
    }


    return 0;
}


async function update_guns_memo2(gun_cpsn,gun_connector){
    console.log("into update_guns_meters()");
    const gun_cpid = await Gun.findOne({ where: { cpsn : gun_cpsn, connector : gun_connector } })
    var now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
    await gun_cpid.update({
        guns_memo2:now_time
    })
    return 0;
}


async function send_cp_to_kw_api(kw_cpid,kw_gun_status,data1,data2,data3,data4,data5,data6) {
    //外站接口
    //gun_cpid={"id":4,"connector":"0","cpsn":"spacepark102","guns_data1":"Available","createdAt":null,"updatedAt":"2024-01-09"}
    console.log("into kw_api:"+kw_gun_status+"cpid="+kw_cpid+"data="+data1+";"+data2+";"+data3+";"+data4+";"+data5+";"+data6);
    const api = 'https://www.spacepark-ev.com/api/cp-callback';
//  const api = 'https://www.spacepark-ev.com/api/cp-callback';
    //  const api = 'http://localhost:8091/send_cp_to_kw_api_test';

    axios.post(api,{
        apikey:'cp_api_key16888',
        cpid: kw_cpid,
        cmd:'report_cp_status',
        cp_online: "online",
        current_status: kw_gun_status,
        data1: data1,
        data2: data2,
        data3: data3,
        data4: data4,
        data5: data5,
        data6: data6
    })
        .then(function (response) {
            //这里获得整个请求响应对象
            //console.log(response);
            var aaa=response.data;
            var bbb=JSON.stringify(aaa);
            console.log('new_url_kwfeeback:'+ bbb);

        })
        .catch(function (error) {
//  console.log(error);
            console.log("kw_new_url_error");
        })
        .then(function () {
        });

}

async function ocpp_send_command(cpid,cmd) {
    //外站接口
    //gun_cpid={"id":4,"connector":"0","cpsn":"spacepark102","guns_data1":"Available","createdAt":null,"updatedAt":"2024-01-09"}
    console.log("into function ocpp_send_command");
    const gun = await Gun.findOne({ where: { cpid : cpid } })
    //  console.log("gun="+gun);
    const cpsn = gun.cpsn;
    console.log("gun.cpid="+gun.cpid);
    console.log("ocpp_send_cpsn="+cpsn);
    console.log("gun.gun_status="+gun.guns_status);
    console.log("gun.connector="+gun.connector);
    console.log("gun.transactionid="+gun.transactionid);

    if(gun.connector==1){
        gun.transactionid = "1111"
    }
    if(gun.connector==2){
        gun.transactionid = "2222"
    }

    if(cmd=="ocpp_status"){
        const result = { succeed: true };
        var  ocpp_id_send="667751515";
        var tt_obj=[2,ocpp_id_send,"TriggerMessage",{"connectorId":parseInt(gun.connector),"requestedMessage":"StatusNotification"}]
        console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
        if(wsClients[cpsn] !== undefined) {
            wsClients[cpsn].forEach((client) => {
                client.send(JSON.stringify(tt_obj));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        console.log('result:'+JSON.stringify(result))
    }

    if(cmd=="ocpp_meters"){
        const result = { succeed: true };
        var  ocpp_id_send="667751515";
        var tt_obj=[2,"667751515","TriggerMessage",{"requestedMessage":"MeterValues","connectorId":parseInt(gun.connector)}]
        console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
        if(wsClients[cpsn] !== undefined) {
            wsClients[cpsn].forEach((client) => {
                client.send(JSON.stringify(tt_obj));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        console.log('result:'+JSON.stringify(result))
    }

    if(cmd=="ocpp_stop_charging"){
        const result = { succeed: true };
        var  ocpp_id_send="667751515";
        //  var tt_obj=[2,"bensoncsms-101-ocpp-send-stop_charging","RemoteStopTransaction",{"connectorId":parseInt(gun.connector),"transactionId":parseInt(gun.transactionid)}]
        var tt_obj=[2,"667751515","RemoteStopTransaction",{"transactionId":parseInt(gun.transactionid)}]

        console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
        if(wsClients[cpsn] !== undefined) {
            wsClients[cpsn].forEach((client) => {
                client.send(JSON.stringify(tt_obj));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        console.log('result:'+JSON.stringify(result))
    }

    if(cmd=="ocpp_start_charging"){
        const result = { succeed: true };
        var  ocpp_id_send="667751515";
        var tt_obj=[2,"667751515","RemoteStartTransaction",{"idTag":idtag_id,"connectorId":1}]
        //  var tt_obj=[2,"bensoncsms-101-ocpp-send-start_charging","RemoteStartTransaction",{"idTag":idtag_id,"connectorId":parseInt(gun.connector),"transactionId":parseInt(gun.transactionid)}]
        //  var tt_obj=[2,"bensoncsms-101-ocpp-send-start_charging","RemoteStartTransaction",{"idTag":idtag_id,"connectorId":parseInt(gun.connector)}]

        console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
        if(wsClients[cpsn] !== undefined) {
            wsClients[cpsn].forEach((client) => {
                client.send(JSON.stringify(tt_obj));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        console.log('result:'+JSON.stringify(result))
    }


}

async function ocpp_send_command_post(cpid,cmd) {
    //外站接口
    //gun_cpid={"id":4,"connector":"0","cpsn":"spacepark102","guns_data1":"Available","createdAt":null,"updatedAt":"2024-01-09"}
    console.log("into function ocpp_send_command");
    const gun = await Gun.findOne({ where: { cpid : cpid } })
    console.log("gun="+gun);
    console.log("gun.cpid="+gun.cpid);
    const api = 'http://localhost:8089/ocpp/api/ocpp_send_cmd';

    axios.post(api,{
        cpid: cpid,
        cmd: cmd
    })
        .then(function (response) {
            //这里获得整个请求响应对象
            //console.log(response);
            var aaa=response.data;
            var bbb=JSON.stringify(aaa);
            console.log('new_url_kwfeeback:'+ bbb);

        })
        .catch(function (error) {
//  console.log(error);
            console.log("kw_new_url_error");
        })
        .then(function () {
        });

}



const ocppController = {
    /*
       功能: KW api----
       方法: POST
       //HTTP api with KW
       // charger cp api
    */
    spacepark_cp_api: async (req, res) => {
        console.log("into /spacepark_cp_api");
        console.log("req.body="+JSON.stringify(req.body));
        //  console.log(req.body.apikey);
        console.log("cpid="+req.body.cp_id);
        let cp_api=req.body.apikey;
        var cp_cmd=req.body.cmd;
        var cpid=req.body.cp_id;

        //  start_charging_id = req.body.start_charging_id;
        //  console.log(start_charging_id);
        //  cp_data6=req.body.start_charging_id;
        if(typeof cpid === "undefined" || cpid === ""){
            console.log("cp_id="+cpid);
            var error_code = {	status: 'err',
                msg: 'cpid undefined'}
            res.setHeader('content-type', 'application/json');
            res.status(400).send(JSON.stringify(error_code));

        }else{

            let res_data={
                cp_res: 'start_charging_now'
            }


            try {
                const gun = await Gun.findOne({ where: { cpid : cpid } })

                console.log("gundata="+JSON.stringify(gun));

                if(gun==null){
                    console.log("cpid="+req.body.cpid);
                    var error_code = {	status: 'err',
                        msg: 'cpid:'+cpid+" is not found"}
                    res.setHeader('content-type', 'application/json');
                    res.status(400).send(JSON.stringify(error_code));

                }else{
                    let res_cp_status={
                        cp_res: "cp_status",
                        cpid: gun.cpid,
                        cp_online: "online",
                        current_status: gun.guns_status,
                        data1: gun.guns_metervalue1,
                        data2: gun.guns_metervalue2,
                        data3: gun.guns_metervalue3,
                        data4: gun.guns_metervalue4,
                        data5: gun.guns_metervalue5,
                        data6: gun.guns_metervalue6
                    }

                    //get_cp_data();

                    if(cp_api=='cp_api_key16888'){
                        switch (cp_cmd) {
                            case 'cmd_start_charging':
                                res.status(200)
                                var start_charging_id = req.body.start_charging_id;
                                console.log("start_charging_id="+start_charging_id);

                                await gun.update({
                                    guns_metervalue6:start_charging_id
                                })
                                console.log("to_kw_cp_data6="+start_charging_id);
                                res_data.cp_res='start_charging_now'
                                var str = JSON.stringify(res_data);
                                console.log('res.send:' + str );

                                res.setHeader('content-type', 'application/json');
                                res.send(str);
                                //設定自動pulling metervalues , 3 秒一次
                                //   if (!nIntervId) {
                                //    nIntervId = setInterval(get_cp_data, set_loop_time);
                                //  }

                                ocpp_send_command(cpid,"ocpp_start_charging");

                                break;

                            case 'cmd_stop_charging':
                                res.status(200)
                                res_data.cp_res='stop_charging_now'
                                var str = JSON.stringify(res_data);
                                console.log('res.send:' + str );
                                res.setHeader('content-type', 'application/json');
                                res.send(str);
                                ocpp_send_command(cpid,"ocpp_stop_charging");

                                break;

                            case 'get_cp_status':
                                ocpp_send_command(cpid,"ocpp_status");
                                ocpp_send_command(cpid,"ocpp_meters");

                                res.status(200)
                                var str = JSON.stringify(res_cp_status);
                                console.log('res.send:' + str );

                                res.setHeader('content-type', 'application/json');
                                res.send(str);
                                // get_cp_data();
                                // send_cp_to_kw_api()
                                break;

                            default:
                                console.log(`Sorry,out of cmd:`+cp_cmd);
                                var error_code = {	status: 'err',
                                    msg: 'cmd不存在'}
                                res.setHeader('content-type', 'application/json');
                                res.status(400).send(JSON.stringify(error_code));
                        }
                        // end of this case-switch
                    } else{
                        console.log(`Sorry,worng cp_api_key:`+cp_api);
                        var error_code = {	status: 'err',
                            msg: 'key不存在'}
                        res.setHeader('content-type', 'application/json');
                        res.status(400).send(JSON.stringify(error_code));

                    }
                }
            } //end of try{}
            catch (e) {
                console.log(e)
            }


        }


    },
    /*
       功能: ocpp test
       方法: get

    */
    ocpp_test: async (req, res) => {
        console.log("into ocpp_test")
        var cpid = "benson_ocpp_csms"
        return res.render('ocpp', {cpid})

    },
    /*
       功能: ocpp see connections
       方法: get

    */
    ocpp_see_connections: async (req, res) => {
        console.log("into ocpp_see_connections")
        setInterval(() => {
            // 定时打印连接池数量
            console.log('OCPP connection counts:')
            Object.keys(wsClients).forEach(key => {
                console.log(key, ':', wsClients[key].length);

                console.log(key, 'wsCpdatas:',JSON.stringify(wsCpdatas[key][0]));

            })
            console.log('-----------------------------');
        }, 10000);
        res.send("ok");

    },

    /*
       功能: ocpp test
       方法: get

    */
    ocpp_cpid: async (req, res) => {
        console.log("into get_ocpp_cpid")
        const cpid = req.params.id
        var from = "benson:"
        const result = { succeed: true };
        console.log("send to cpid:"+cpid)
        if(wsClients[cpid] !== undefined) {
            wsClients[cpid].forEach((client) => {
                client.send(JSON.stringify({
                    from,
                    content: "slkerjw"
                }));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        res.json(result);

    },

    /*
       功能: ocpp_stop_charging
       方法: get

    */
    ocpp_stop_charging: async (req, res) => {
        console.log("into get_ocpp_stop_charging")
        const cpid = req.params.cpid
        const result = { succeed: true };

        var  ocpp_id_send="bensoncsms-101-ocpp-send";
        var tt_obj=[2,ocpp_id_send,"TriggerMessage",{"connectorId":1,"requestedMessage":"StatusNotification"}]
        console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
        console.log('send to cpid:'+cpid+"params.cmd="+req.params.cmd)

        if(wsClients[cpid] !== undefined) {
            wsClients[cpid].forEach((client) => {
                client.send(JSON.stringify(tt_obj));
            });
        } else {
            // 如果消息接收方没有连接，则返回错误信息
            result.succeed = false;
            result.msg = '对方不在线';
        }
        res.json(result);

    },

    /*
       功能: ocpp_send_test
       方法: get

    */
    ocpp_send_test: async (req, res) => {
        console.log("into get_ocpp_send_test")
        //    const id = req.params.id
//console.log("req.params.cpid="+JSON.stringify(req.body))
        // ocpp_send_command("1001","ocpp_stop_charging");
//  ocpp_send_command("1001","ocpp_status");
//  ocpp_send_command("1001","ocpp_stop_charging");
//  ocpp_send_command("1001","ocpp_start_charging");
        ocpp_send_command("1002","ocpp_meters");

        res.json("ok");

    },

    /*
       功能: ocpp_send_cmd
       方法: POST
       參數: email, password
    */
    ocpp_send_cmd: async (req, res) => {
        console.log("into ocpp_send_cmd")
        try {
            const { cpid, cmd } = req.body
            console.log("ocpp_send_cmd_cpid:"+cpid)
            console.log("ocpp_send_cmd_cmd:"+cmd)


        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: ocpp test
       方法: get

    */
    ocpp_ws: async (ws, req) => {
        /*
        setInterval(() => {
            // 定时打印连接池数量
            console.log('websocket connection counts:')
            Object.keys(wsClients).forEach(key => {
                console.log(key, ':', wsClients[key].length);
            })
            console.log('-----------------------------');
        }, 5000);
     */
        console.log('连接成功')
//const cpsn = await Order.findOne({ where: { id : 1 } })
        // const cpsn = read_data()
        var ocpp_message="";
        const id = req.params.id;
        var jj_data=JSON.stringify(ws);
        console.log("req.params="+req.params.id);
        //      console.log("req.all="+jj_data);
        if(!wsClients[req.params.id]) {
            wsClients[req.params.id] = []
        }
        if(!wsCpdatas[req.params.id]) {
            wsCpdatas[req.params.id] = []
        }
        // 将连接记录在连接池中
        wsClients[req.params.id].push(ws);
        console.log("wsClients="+JSON.stringify(wsClients));

        var socket_cp_data ={
            cpsn: req.params.id,
            cp_online: "online",
            cp_vendor : "",
            cp_model : "",
            memo1 :  "",
            memo2 : "",
            heartbeat : "",

            connector_1_meter:{
                cpid_mapping : "",
                current_status: "",
                charging_start_time : "",
                charging_stop_time : "",
                last_total_time : "",
                last_kwh : "",
                data1: "0.00",
                data2: "0.00",
                data3: "0.00",
                data4: "0.00",
                data5: "0.00",
                data6: "0.00"
            },
            connector_2_meter:{
                cpid_mapping : "",
                current_status: "",
                charging_start_time : "",
                charging_stop_time : "",
                last_total_time : "",
                last_kwh : "",
                data1: "0.00",
                data2: "0.00",
                data3: "0.00",
                data4: "0.00",
                data5: "0.00",
                data6: "0.00"
            },
            connector_3_meter:{
                cpid_mapping : "",
                current_status: "",
                charging_start_time : "",
                charging_stop_time : "",
                last_total_time : "",
                last_kwh : "",
                data1: "0.00",
                data2: "0.00",
                data3: "0.00",
                data4: "0.00",
                data5: "0.00",
                data6: "0.00"
            },
            connector_4_meter:{
                cpid_mapping : "",
                current_status: "",
                charging_start_time : "",
                charging_stop_time : "",
                last_total_time : "",
                last_kwh : "",
                data1: "0.00",
                data2: "0.00",
                data3: "0.00",
                data4: "0.00",
                data5: "0.00",
                data6: "0.00"
            }
        }

        wsCpdatas[req.params.id].push(socket_cp_data);
        console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas));
        console.log("wsCpdatas_socket_cp_data_cpid="+JSON.stringify(wsCpdatas[req.params.id][0].cpsn));

//start of ws.on message
        ws.on('message', data => {
            //data 為 Client 發送的訊息，現在將訊息原封不動發送出去
            console.log("message="+req.params.id+data );
            ocpp_message = data;
            //   ws.send("server_feedback:"+req.params.id+":"+data)
            // find cpsn
            //   const cpsn = (async () =>{ await Order.findOne({ where: { id : 1 } }) })();
            //   console.log("read_Cp_gun_datas="+JSON.stringify(cpsn));
            //  update_guns_data(id,"1","Charging")
            // 建立 cp log
            Cp_log.create({
                // id: 2,
                cpid: id,
                cpsn: id,
                log: ocpp_message,
                time: new Date(),
                inout: "in",
            })
            if(id=="2022111407200005"){
                console.log("2022incoming:"+id );
                update_guns_memo2(id,1)
            }
            mqtt_client.publish('/benson_csms_mqtt_all/',id+"/"+ocpp_message);
            mqtt_client.publish('/benson_mqtt/'+id,ocpp_message);
            // start to ocpp
            var j_aa=JSON.parse(data)
            //[2,"863a9bae-e24d-795b-6a7f-6b5a32e09c69","BootNotification",{"chargePointVendor":"SpacePark","chargePointModel":"EU1060_TYPE_II","chargePointSerialNumber":"spacepark102","chargeBoxSerialNumber":"5D45CFF0362B41D7500100A3","firmwareVersion":"ACM4_EVSE_V12.38","meterType":"D1006BF"}]

            if(j_aa[2]=="BootNotification"){
                console.log('into BootNotification proc')
                wsCpdatas[req.params.id][0].cp_vendor = j_aa[3].chargePointVendor
                wsCpdatas[req.params.id][0].cp_model = j_aa[3].chargePointModel

                console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));

                //2022-10-04T15:05:486Z
                var tt_obj=[3,"6677543",{

                    //  "registrationStatus":"Accepted"
                    "currentTime":"2022-10-04T15:05:486Z",
                    "interval":30,
                    "status":"Accepted"
                }]
                tt_obj[1]=j_aa[1]
                //     var cur_dateiso=new Date()+8 * 3600 * 1000
                now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                tt_obj[2].currentTime=now_time
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })

            }

            if(j_aa[2]=="StatusNotification"){
                console.log('into "StatusNotification" proc')
//  [2,"53318fcc-2668-5a56-aaff-d741784db2d9","StatusNotification",{"connectorId":1,"errorCode":"NoError","status":"Charging"
                //  console.log('status='+j_aa[3].status)
                // status changed!!
                var thisconnector=j_aa[3].connectorId
                cpid_mapping( id , thisconnector );

                if(thisconnector==1){
                    wsCpdatas[req.params.id][0].connector_1_meter.current_status = j_aa[3].status
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                }
                if(thisconnector==2){
                    wsCpdatas[req.params.id][0].connector_2_meter.current_status = j_aa[3].status
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                }

                if(cp_current_status!=j_aa[3].status){
                    cp_current_status=j_aa[3].status;
                    //     cp_status_changed();
                }
                cp_current_status=j_aa[3].status;
                console.log('status='+cp_current_status)
                var tt_obj=[3,6677543,{}]
                tt_obj[1]=j_aa[1]
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
                ws.send(JSON.stringify(tt_obj))
                update_guns_status(id,j_aa[3].connectorId,j_aa[3].status)
                /*
            Cp_log.create({
                  // id: 2,
                   cpid: id,
                   cpsn: id,
                   log: JSON.stringify(tt_obj),
                   time: new Date(),
                   inout: "out",
                 })

                  */
            }
            if(j_aa[2]=="Heartbeat"){
                console.log('into "Heartbeat" proc')

                var tt_obj=[3,6677543,{"currentTime":"2022-10-04T15:05:486Z"}]
                tt_obj[1]=j_aa[1]
                now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                tt_obj[2].currentTime=now_time
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))

                wsCpdatas[req.params.id][0].heartbeat = now_time
                console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));


                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })

            }

            if(j_aa[2]=="Authorize"){
                console.log('into "Authorize" proc')

                var tt_obj=[3,6677543,{"idTagInfo":{"status":"Accepted"}}]
                tt_obj[1]=j_aa[1]
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })
            }

            if(j_aa[2]=="StartTransaction"){
                console.log('into "StartTransaction" proc')
                //[2,"fdb09c01-ba68-7ac4-5f05-8687dfa317d9","StartTransaction",{"connectorId":1,"idTag":"wang1234","meterStart":0,"timestamp":"2024-01-23T14:44:08.001Z"}]
                //expiryDate=taipei time + 24h
                var thisconnector=j_aa[3].connectorId
                console.log('start_connectorid:'+thisconnector)
                if(thisconnector==1){
                    trans_id=1111;
                    now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                    wsCpdatas[req.params.id][0].connector_1_meter.charging_start_time = now_time
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                }
                if(thisconnector==2){
                    trans_id=2222;
                    now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                    wsCpdatas[req.params.id][0].connector_2_meter.charging_start_time = now_time
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));

                }
                exp_time=new Date(+new Date() + 8 * 3600 * 1000 * 24).toISOString()
                //     var tt_obj=[3,6677543,{"idTagInfo":{"expiryDate":exp_time,"status":"Accepted","transactionId":trans_id}}]
                var tt_obj=[3,6677543,{"idTagInfo":{"expiryDate":exp_time,"status":"Accepted"},"transactionId":trans_id}]

                tt_obj[1]=j_aa[1]
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))


                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })
            }

//[2,"02293dfb-99a3-25bc-e807-63f839b15602","StopTransaction",
//{"idTag":"wang1234","meterStop":172,"timestamp":"2024-02-06T01:05:19.001Z","transactionId":2222,"reason":"EVDisconnected"}]

            if(j_aa[2]=="StopTransaction"){
                console.log('into "StopTransaction" proc')
                if(j_aa[3].transactionId==1111){
                    update_guns_status(id,1,"Finishing");
                    now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                    wsCpdatas[req.params.id][0].connector_1_meter.charging_stop_time = now_time
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));

                }
                if(j_aa[3].transactionId==2222){
                    update_guns_status(id,2,"Finishing");
                    now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                    wsCpdatas[req.params.id][0].connector_2_meter.charging_start_time = now_time
                    console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));

                }

                //expiryDate=taipei time + 24h
                exp_time=new Date(+new Date() + 8 * 3600 * 1000 * 24).toISOString()
                var tt_obj=[3,6677543,{}]
                tt_obj[1]=j_aa[1]
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))

                now_time=new Date(+new Date() + 8 * 3600 * 1000).toISOString()
                wsCpdatas[req.params.id][0].charging_stop_time = now_time
                console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));


                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })
            }

            if(j_aa[2]=="DataTransfer"){
                console.log('into "DataTransfer" proc')
                //expiryDate=taipei time + 24h
                exp_time=new Date(+new Date() + 8 * 3600 * 1000 * 24).toISOString()
                var tt_obj=[3,6677543,{"status":"Accepted"}]
                tt_obj[1]=j_aa[1]
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })
            }
            if(j_aa[2]=="MeterValues"){
                console.log('into "MeterValues" proc')
                /*
                [2,"cb41ee88-af8b-749c-ec04-40d4ef4e802b","MeterValues",{"connectorId":2,"transactionId":0,"meterValue":[{"timestamp":"2023-12-26T22:27:56.001Z",
                "sampledValue":[
                  {"value":"2759.100","unit":"Wh","context":"Sample.Periodic","format":"Raw","measurand":"Energy.Active.Import.Register","location":"Outlet"}
                  ]
                }]
                }]

                [2,"f8350340-162a-2b01-b1dd-d5050b750606","MeterValues",
                {
                "connectorId":2,
                "transactionId":0,
                "meterValue":[
                 {"timestamp":"2023-12-26T15:01:56.001Z",
                  "sampledValue":[
                    {"value":"4.320","context":"Sample.Periodic","format":"Raw","measurand":"Current.Import","phase":"L1","location":"Outlet","unit":"A"},
                    {"value":"1949.200","unit":"Wh","context":"Sample.Periodic","format":"Raw","measurand":"Energy.Active.Import.Register","location":"Outlet"},
                    {"value":"0.979","context":"Sample.Periodic","format":"Raw","measurand":"Power.Active.Import","phase":"L1-N","location":"Outlet","unit":"kW"},
                    {"value":"227.300","context":"Sample.Periodic","format":"Raw","measurand":"Voltage","phase":"L1-N","location":"Outlet","unit":"V"}               ]
                 }
                ]
                }
                ]
                */
                //need to catch all_message[3].meterValue[0].sampledValue[0]=data1,[1]=data2,[4]=data3
                //if(j_aa[3].meterValue[0].sampledValue[0].value>0){cp_data1 = j_aa[3].meterValue[0].sampledValue[0].value;}
                //if(j_aa[3].meterValue[0].sampledValue[1].value>0){cp_data2 = j_aa[3].meterValue[0].sampledValue[1].value;}
                //if(j_aa[3].meterValue[0].sampledValue[4].value>0){cp_data3 = j_aa[3].meterValue[0].sampledValue[4].value;}

//ABB meters messages:
//[2, "2982648", "MeterValues", {"connectorId": 1, "transactionId": 1111, "meterValue": [{"timestamp": "2024-02-26T07:46:22.000Z",
// "sampledValue": [
//{"value": "228.90", "context": "Sample.Periodic", "format": "Raw", "measurand": "Voltage", "phase": "L1-L2", "unit": "V"},
// {"value": "0.0", "context": "Sample.Periodic", "format": "Raw", "measurand": "Current.Import", "phase": "L1", "unit": "A"},
// {"value": "0", "context": "Sample.Periodic", "format": "Raw", "measurand": "Power.Active.Import", "phase": "L1", "unit": "W"},
// {"value": "0", "context": "Sample.Periodic", "format": "Raw", "measurand": "Energy.Active.Import.Register", "unit": "Wh"}]}]}]
                console.log("now in metervalues id="+id);

                if(id[0]=="T" && id[1]=="A" && id[2]=="C"){
                    console.log("this is ABB's meters");
                    var meter_connectorid=j_aa[3].connectorId
                    var meter_transactionid= j_aa[3].transactionId
                    console.log('metervalue_connectorid:'+meter_connectorid);
                    console.log('metervalue_transactionid:'+meter_transactionid);
                    cp_data1 =  j_aa[3].meterValue[0].sampledValue[3].value
                    cp_data1 = cp_data1/1000
                    cp_data2 =  j_aa[3].meterValue[0].sampledValue[1].value
                    cp_data3 =  j_aa[3].meterValue[0].sampledValue[0].value
                    cp_data1 = cp_data1.toFixed(3)
                    cp_data4 = cp_data2*cp_data3;
                    cp_data4 = cp_data4.toFixed(3)
                    console.log('metervalue_In-charging khw_cp_data1:'+cp_data1);
                    console.log('metervalue_In-charging A_cp_data2:'+cp_data2);
                    console.log('metervalue_In-charging V_cp_data3:'+cp_data3);
                    console.log('metervalue_In-charging power_cp_data4:'+cp_data4);
                    if(j_aa[3].connectorId==1){
                        wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                        wsCpdatas[req.params.id][0].connector_1_meter.data2 = cp_data2
                        wsCpdatas[req.params.id][0].connector_1_meter.data3 = cp_data3
                        wsCpdatas[req.params.id][0].connector_1_meter.data4 = cp_data4
                        wsCpdatas[req.params.id][0].connector_1_meter.data5 = cp_data5
                        console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                    }
                    update_guns_meters(req.params.id,meter_connectorid,cp_data1,cp_data2,cp_data3,cp_data4)

                }
                if(id[0]=="s" && id[1]=="p"){
                    console.log("this is spacepark's meters");

                    var meter_connectorid=j_aa[3].connectorId
                    var meter_transactionid= j_aa[3].transactionId
                    console.log('metervalue_connectorid:'+meter_connectorid);
                    console.log('metervalue_transactionid:'+meter_transactionid);
                    if(j_aa[3].meterValue[0].sampledValue[0].unit=="Wh"){
                        cp_data1 = j_aa[3].meterValue[0].sampledValue[0].value
                        // alex said it to 100 to test
                        // /1000 is for kwh
                        cp_data1 = cp_data1/1000
                        cp_data1 = cp_data1.toFixed(3)
                        console.log('metervalue_No-charging_Wh:'+cp_data1);
                        //console.log('metervalue_No-charging_kWh:'+cp_data1/1000);
                        cp_data2 = "0.00";
                        cp_data3 = "0.0";
                        cp_data4 = "0.0";

                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    } else {
                        // alex said it to 100 to test
                        cp_data1 =  j_aa[3].meterValue[0].sampledValue[1].value
                        cp_data1 = cp_data1/1000
                        cp_data2 =  j_aa[3].meterValue[0].sampledValue[0].value
                        cp_data3 =  j_aa[3].meterValue[0].sampledValue[3].value
                        cp_data1 = cp_data1.toFixed(3)
                        cp_data4 = cp_data2*cp_data3;
                        cp_data4 = cp_data4.toFixed(3)
                        console.log('metervalue_In-charging khw_cp_data1:'+cp_data1);
                        console.log('metervalue_In-charging A_cp_data2:'+cp_data2);
                        console.log('metervalue_In-charging V_cp_data3:'+cp_data3);
                        console.log('metervalue_In-charging power_cp_data4:'+cp_data4);
                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_1_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_1_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_1_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_1_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_2_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_2_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_2_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_2_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    }

                    update_guns_meters(req.params.id,meter_connectorid,cp_data1,cp_data2,cp_data3,cp_data4)
                }
                if(id[0]=="G" && id[1]=="S"){
                    console.log("GSGSGSGSGSGSGS---------------------this is GS's meters");
                    console.log("GSGSGSGSGSGSGS---------------------this is GS's meters");
                    console.log("GSGSGSGSGSGSGS---------------------this is GS's meters");
                    console.log("GSGSGSGSGSGSGS---------------------this is GS's meters");
                    console.log('metervalue_[0]:'+j_aa[3].meterValue[0].sampledValue[0].value);
                    console.log('metervalue_[1]:'+j_aa[3].meterValue[0].sampledValue[1].value);
                    console.log('metervalue_[2]:'+j_aa[3].meterValue[0].sampledValue[2].value);
                    console.log('metervalue_[3]:'+j_aa[3].meterValue[0].sampledValue[3].value);
                    console.log('metervalue_[4]:'+j_aa[3].meterValue[0].sampledValue[4].value);
                    console.log('metervalue_[5]:'+j_aa[3].meterValue[0].sampledValue[5].value);
                    console.log('metervalue_[6]:'+j_aa[3].meterValue[0].sampledValue[6].value);
                    console.log('metervalue_[7]:'+j_aa[3].meterValue[0].sampledValue[7].value);
                    console.log('metervalue_[8]:'+j_aa[3].meterValue[0].sampledValue[8].value);
                    console.log('metervalue_[9]:'+j_aa[3].meterValue[0].sampledValue[9].value);

                    var meter_connectorid=j_aa[3].connectorId
                    var meter_transactionid= j_aa[3].transactionId
                    console.log('metervalue_connectorid:'+meter_connectorid);
                    console.log('metervalue_transactionid:'+meter_transactionid);
                    if(j_aa[3].meterValue[0].sampledValue[0].unit=="Wh"){
                        cp_data1 = j_aa[3].meterValue[0].sampledValue[0].value
                        // alex said it to 100 to test
                        // /1000 is for kwh
                        cp_data1 = cp_data1/1000
                        cp_data1 = cp_data1.toFixed(3)
                        console.log('metervalue_No-charging_Wh:'+cp_data1);
                        //console.log('metervalue_No-charging_kWh:'+cp_data1/1000);
                        cp_data2 = "0.00";
                        cp_data3 = "0.0";
                        cp_data4 = "0.0";

                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    } else {
                        // alex said it to 100 to test
                        cp_data1 =  j_aa[3].meterValue[0].sampledValue[4].value
                        cp_data1 = cp_data1/1000
                        cp_data2 =  j_aa[3].meterValue[0].sampledValue[0].value
                        cp_data3 =  j_aa[3].meterValue[0].sampledValue[7].value
                        cp_data1 = cp_data1.toFixed(3)
                        cp_data4 = cp_data2*cp_data3;
                        cp_data4 = cp_data4.toFixed(3)
                        console.log('metervalue_In-charging khw_cp_data1:'+cp_data1);
                        console.log('metervalue_In-charging A_cp_data2:'+cp_data2);
                        console.log('metervalue_In-charging V_cp_data3:'+cp_data3);
                        console.log('metervalue_In-charging power_cp_data4:'+cp_data4);
                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_1_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_1_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_1_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_1_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_2_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_2_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_2_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_2_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    }

                    update_guns_meters(req.params.id,meter_connectorid,cp_data1,cp_data2,cp_data3,cp_data4)
                }
                if(id[0]=="G" && id[1]=="R" && id[2]=="E" && id[3]=="E" && id[4]=="N"){
                    console.log("Green---------------------this is GS's meters");
                    console.log("Green---------------------this is GS's meters");
                    console.log("Green---------------------this is GS's meters");
                    console.log("Green---------------------this is GS's meters");
                    console.log("Green---------------------this is GS's meters");

                    console.log('metervalue_[0]:'+j_aa[3].meterValue[0].sampledValue[0].value);
                    console.log('metervalue_[1]:'+j_aa[3].meterValue[0].sampledValue[1].value);
                    console.log('metervalue_[2]:'+j_aa[3].meterValue[0].sampledValue[2].value);
                    console.log('metervalue_[3]:'+j_aa[3].meterValue[0].sampledValue[3].value);
                    console.log('metervalue_[4]:'+j_aa[3].meterValue[0].sampledValue[4].value);

                    var meter_connectorid=j_aa[3].connectorId
                    var meter_transactionid= j_aa[3].transactionId
                    console.log('metervalue_connectorid:'+meter_connectorid);
                    console.log('metervalue_transactionid:'+meter_transactionid);
                    if(j_aa[3].meterValue[0].sampledValue[0].unit=="Wh"){
                        cp_data1 = j_aa[3].meterValue[0].sampledValue[0].value
                        // alex said it to 100 to test
                        // /1000 is for kwh
                        //    cp_data1 = cp_data1/1000
                        //    cp_data1 = cp_data1.toFixed(3)
                        console.log('metervalue_No-charging_Wh:'+cp_data1);
                        //console.log('metervalue_No-charging_kWh:'+cp_data1/1000);
                        cp_data2 = "0.00";
                        cp_data3 = "0.0";
                        cp_data4 = "0.0";

                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    } else {
                        // alex said it to 100 to test
                        cp_data1 =  j_aa[3].meterValue[0].sampledValue[0].value
                        //  cp_data1 = cp_data1/1000
                        cp_data2 =  j_aa[3].meterValue[0].sampledValue[2].value
                        cp_data3 =  j_aa[3].meterValue[0].sampledValue[3].value
                        //  cp_data1 = cp_data1.toFixed(3)
                        cp_data4 = cp_data2*cp_data3;
                        cp_data4 = cp_data4.toFixed(3)
                        console.log('metervalue_In-charging khw_cp_data1:'+cp_data1);
                        console.log('metervalue_In-charging A_cp_data2:'+cp_data2);
                        console.log('metervalue_In-charging V_cp_data3:'+cp_data3);
                        console.log('metervalue_In-charging power_cp_data4:'+cp_data4);
                        if(j_aa[3].connectorId==1){
                            wsCpdatas[req.params.id][0].connector_1_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_1_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_1_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_1_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_1_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }
                        if(j_aa[3].connectorId==2){
                            wsCpdatas[req.params.id][0].connector_2_meter.data1 = cp_data1
                            wsCpdatas[req.params.id][0].connector_2_meter.data2 = cp_data2
                            wsCpdatas[req.params.id][0].connector_2_meter.data3 = cp_data3
                            wsCpdatas[req.params.id][0].connector_2_meter.data4 = cp_data4
                            wsCpdatas[req.params.id][0].connector_2_meter.data5 = cp_data5
                            console.log("wsCpdatas_all="+JSON.stringify(wsCpdatas[req.params.id][0]));
                        }

                    }

                    update_guns_meters(req.params.id,meter_connectorid,cp_data1,cp_data2,cp_data3,cp_data4)
                }


                var tt_obj=[3,6677543,{"status":"Accepted"}]
                tt_obj[1]=j_aa[1]
                ws.send(JSON.stringify(tt_obj))
                console.log('send_to_ev_charger_json:'+JSON.stringify(tt_obj))
                Cp_log.create({
                    // id: 2,
                    cpid: id,
                    cpsn: id,
                    log: JSON.stringify(tt_obj),
                    time: new Date(),
                    inout: "out",
                })
                //get_ocpp_4_data();
            }


//end of ws.on message
        })

        ws.onclose = () => {
            // 连接关闭时，wsClients进行清理
            wsClients[req.params.id] = wsClients[req.params.id].filter((client) => {
                return client !== ws;
            });
            if(wsClients[req.params.id].length === 0) {
                delete wsClients[req.params.id];
            }
            delete wsCpdatas[req.params.id];
        }



    },




    /*
       功能: ecpay 交易後回傳
       方法: get

    */
    ecpay_into_db_payment: async (req, res) => {
        console.log("into ecpay into_db_payment")
        console.log("call robot")

        axios.get('http://rcu.dq1.tw:8093/robot_auto_sale',{
            //URL参數放在params屬性裏面
            params: {
                final_target: '101'
            }
        })
            .then((response) => console.log(response.data))
            .catch((error) => console.log(error))

        try {
            const id = req.params.id
            console.log("sn_id="+id)
            // 訂單
            const order = await Order.findOne({ where: { sn: id } })


            // 建立 payment
            await Payment.create({
                OrderId: order.id,
                payment_method: "ecpay",
                isSuccess: true,
                failure_message: "ecpay messages",
                payTime: new Date()
            })
            await order.update({
                ...req.body,
                payment_status: '1'
            })

            req.flash('success_msg', `訂單編號:${order.id} 信用卡(綠界ECpay)付款成功!`)

            return res.redirect(`/order/${order.id}`)
        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: ecpay result (from https://4bec-59-125-1-112.ngrok-free.app/order/ecpay/callback)
       方法: post
    */
    ecpay_call_back: async (req, res) => {
        console.log("into_ecpay_call_back");
        var jj_data=JSON.stringify(req.params);
        console.log("req.params="+req.params);
        console.log("jj_data="+jj_data);
        console.log("req.body="+req.body);
        jj_data=JSON.stringify(req.body);
        console.log("req="+jj_data);
        //"MerchantTradeNo"
        console.log("MerchantTradeNo(sn)="+req.body.MerchantTradeNo);

        return res.redirect(`/order/ecpay_into_db_payment/${req.body.MerchantTradeNo}`)
    },
    /*
       功能: ecpay Client端方式(POST)(OrderResultURL) (from https://4bec-59-125-1-112.ngrok-free.app/order/ecpay/callback)
       方法: post
    */
    ecpay_return_url: async (req, res) => {
        console.log("into_ecpay_return_url");
        //  var jj_data=JSON.stringify(req.params);
        //  console.log("req.params="+req.params);
        //  console.log("jj_data="+jj_data);
        return res.send("1|OK")
    },


    /*
       功能: ecpay_all test
       方法: get
    */
    ecpay_all: async (req, res) => {
        console.log("into_ecpay_all")
        const id = req.params.id
        const order = await Order.findByPk(id)
        var ecpayorder_id=order.sn
        let base_param = {
            MerchantTradeNo: 'spacepark', //請帶20碼uid, ex: f0a0d7e9fae1bb72bc93
            MerchantTradeDate: '2017/02/13 15:45:31', //ex: 2017/02/13 15:45:30
            TotalAmount: '1000',
            TradeDesc: 'spacepark',
            ItemName: 'charger',
            ReturnURL: 'https://4bec-59-125-1-112.ngrok-free.app/order/ecpay_return_url',
            // ChooseSubPayment: '',
            OrderResultURL: 'https://4bec-59-125-1-112.ngrok-free.app/order/ecpay_callback',
            // NeedExtraPaidInfo: '1',
            ClientBackURL: 'https://4bec-59-125-1-112.ngrok-free.app',
            // ItemURL: 'http://item.test.tw',
            // Remark: '交易備註',
            // HoldTradeAMT: '1',
            // StoreID: '',
            // CustomField1: '',
            // CustomField2: '',
            // CustomField3: '',
            // CustomField4: ''
        }

        const options = {
            "OperationMode": "Test", //Test or Production
            "MercProfile": {
                "MerchantID": "2000132",
                "HashKey": "5294y06JbISpM5x9",
                "HashIV": "v77hoKGq4kWxNNIS"
            },
            "IgnorePayment": [
                //    "Credit",
                //    "WebATM",
                //    "ATM",
                //    "CVS",
                //    "BARCODE",
                //    "AndroidPay"
            ],
            "IsProjectContractor": false
        }
        //電子發票
        let inv_params = {
            // RelateNumber: 'PLEASE MODIFY',  //請帶30碼uid ex: SJDFJGH24FJIL97G73653XM0VOMS4K
            // CustomerID: 'MEM_0000001',  //會員編號
            // CustomerIdentifier: '',   //統一編號
            // CustomerName: '測試買家',
            // CustomerAddr: '測試用地址',
            // CustomerPhone: '0123456789',
            // CustomerEmail: 'johndoe@test.com',
            // ClearanceMark: '2',
            // TaxType: '1',
            // CarruerType: '',
            // CarruerNum: '',
            // Donation: '2',
            // LoveCode: '',
            // Print: '1',
            // InvoiceItemName: '測試商品1|測試商品2',
            // InvoiceItemCount: '2|3',
            // InvoiceItemWord: '個|包',
            // InvoiceItemPrice: '35|10',
            // InvoiceItemTaxType: '1|1',
            // InvoiceRemark: '測試商品1的說明|測試商品2的說明',
            // DelayDay: '0',
            // InvType: '07'
        }


        var create = new ecpay_payment(options)
        var send_data_to_ecpay={};
        send_data_to_ecpay=base_param;
        send_data_to_ecpay.MerchantTradeNo=ecpayorder_id;
        var htm = create.payment_client.aio_check_out_all(parameters = send_data_to_ecpay, invoice = inv_params)
        //    var htm = create.payment_client.aio_check_out_all(parameters = base_param, invoice = inv_params)
        console.log(htm)
        //res.sendFile( htm );
        return res.send( htm );
    },
    /*
       功能: 交易後回傳
       方法: get

    */
    into_db_payment: async (req, res) => {
        console.log("into into_db_payment")
        console.log("call robot")
        axios.get('http://rcu.dq1.tw:8093/robot_auto_sale',{
            //URL参數放在params屬性裏面
            params: {
                final_target: '101'
            }
        })
            .then((response) => console.log(response.data))
            .catch((error) => console.log(error))

        try {
            const id = req.params.id
            console.log("sn_id="+id)
            // 訂單
            const order = await Order.findOne({ where: { sn: id } })


            // 建立 payment
            await Payment.create({
                OrderId: order.id,
                payment_method: "linepay",
                isSuccess: true,
                failure_message: "linepay messages",
                payTime: new Date()
            })
            await order.update({
                ...req.body,
                payment_status: '1'
            })

            req.flash('success_msg', `訂單編號:${order.id} Linepay付款成功!`)

            return res.redirect(`/order/${order.id}`)
        } catch (e) {
            console.log(e)
        }
    },
    /*
       功能: linepay result
       方法: GET
    */
    linepay_result: async (req, res) => {
        console.log('linepay_success:transactionId',req.query.transactionId);
        var linepay_confirm_url="https://sandbox-api-pay.line.me/v2/payments/"+req.query.transactionId+"/confirm";
        console.log(linepay_confirm_url);

        axios({
            method: 'post',
            //baseURL: 'https://iot.cht.com.tw',
            url: linepay_confirm_url,
            headers: {
                'Content-Type': 'application/json',
                'X-LINE-ChannelID': '1657416589',
                'X-LINE-ChannelSecret': '61e3e5036842dba1a852f6feccab91de'
            },
            data: {
                "amount":100,
                "currency":"TWD"
            },

        })
            .then((result) => {
                console.log(result.data)
                console.log(result.data.info)
                console.log(result.data.info.orderId)
                console.log(result.data.info.transactionId)
                //  return  res.send('<H2>恭喜Linepay支付成功!</H2></br>'+'linepay交易碼:'+result.data.info.transactionId)
                console.log("恭喜Linepay支付成功!")
                return res.redirect(`/order/sn/${result.data.info.orderId}`)
            })
            .catch((err) => { console.error(err) })
    },


    /*
       功能: linepay test
       方法: post
    */
    linepay_test: async (req, res) => {
        const id = req.params.id
        const order = await Order.findByPk(id)
        var linepayorder_id=order.sn
        console.log("linepayorder_id="+linepayorder_id)
        var send_body_data={
            "amount":100,
            "productImageUrl":"",
            "confirmUrl":"https://4bec-59-125-1-112.ngrok-free.app/order/linepay/result",
            "productName":"linepay測試",
            "orderId":linepayorder_id,
            "currency":"TWD"
        }
        //send_body_data.orderId="benson"+linepayorder_id;

        //linepayorder_id++
        axios({
            method: 'post',
            //baseURL: 'https://iot.cht.com.tw',
            url: 'https://sandbox-api-pay.line.me/v2/payments/request',
            headers: {
                'Content-Type': 'application/json',
                'X-LINE-ChannelID': '1657416589',
                'X-LINE-ChannelSecret': '61e3e5036842dba1a852f6feccab91de'
            },
            data: send_body_data,

        })
            .then((result) => {
                console.log(result.data)
                console.log(result.data.info.paymentUrl.web)

                console.log(result.data.info.transactionId)
                return res.redirect(301,result.data.info.paymentUrl.web)

            })
            .catch((err) => { console.error(err) })
    },
    /*
       功能: 取得所有訂單
       方法: GET
    */
    getOrders: async (req, res) => {
        try {
            const ordersHavingProducts = await Order.findAll({
                raw: true,
                nest: true,
                where: { UserId: req.user.id },
                include: 'items'
            })
            const orders = await Order.findAll({
                raw: true,
                nest: true,
                where: { UserId: req.user.id }
            })
            orders.forEach(order => { order.items = [] })
            ordersHavingProducts.forEach(product => {
                const index = orders.findIndex(order => order.id === product.id)
                if (index === -1) return
                orders[index].items.push(product.items)
            })
            return res.render('orders', { orders })
        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: 個別訂單
       方法: GET
       參數: params.id
    */
    getOrder: async (req, res) => {
        try {
            const id = req.params.id
            const order = await Order.findByPk(id, { include: 'items' })
            if (order.toJSON().payment_status === '0') {
                const tradeData = mpgData.getData(order.amount, 'Diving Park-精選商品', req.user.email)
                await order.update({ sn: tradeData.MerchantOrderNo.toString() })
                return res.render('order', { order: order.toJSON(), tradeData })
            } else {
                const paidOrder = true
                return res.render('order', { order: order.toJSON(), paidOrder })
            }
        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: 訂購清單
       方法: GET
       參數: user.id
    */
    fillOrderData: async (req, res) => {
        try {
            const UserId = req.user.id
            const cart = await Cart.findOne({ where: { UserId }, include: 'items' })
            if (!cart || !cart.items.length) {
                req.flash('warning_msg', '購物車空空的唷!')
                return res.redirect('/cart')
            }

            const cartId = cart.id
            const amount = cart.items.length > 0 ? cart.items.map(d => d.price * d.CartItem.quantity).reduce((a, b) => a + b) : 0
            return res.render('orderInfo', { cartId, amount })
        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: 建立訂單
       方法: POST
       參數: name, address, phone, amount, shipping_status, payment_status
    */
    postOrder: async (req, res) => {
        console.log("/into postOrder dskdjfs")
        //測試直接送出機器人指令
        /*
        axios.get('http://rcu.dq1.tw:8093/robot_auto_sale',{
          //URL参數放在params屬性裏面
          params: {
              final_target: '101'
          }
      })
      .then((response) => console.log(response.data))
      .catch((error) => console.log(error))
      */
        try {
            const { cartId } = req.body
            const cart = await Cart.findByPk(cartId, { include: 'items' })
            // 建立訂單
            let order = await Order.create({
                ...req.body,
                UserId: req.user.id
            })
            order = order.toJSON()
            const items = Array.from({ length: cart.items.length })
                .map((_, i) => (
                    OrderItem.create({
                        OrderId: order.id,
                        ProductId: cart.items[i].dataValues.id,
                        price: cart.items[i].dataValues.price,
                        quantity: cart.items[i].CartItem.dataValues.quantity
                    })
                ))

            await Promise.all(items)



            // 清空購物車
            await cart.destroy()
            req.session.cartId = ''
            return res.redirect(`/order/${order.id}`)
        } catch (e) {
            console.log(e)
        }


    },

    /*
       功能: 取消訂單
       方法: POST
       參數: params.id
    */
    cancelOrder: async (req, res) => {
        try {
            const id = req.params.id
            const order = await Order.findByPk(id)
            await order.update({
                ...req.body,
                shipping_status: '-1',
                payment_status: '-1'
            })
            req.flash('success_msg', '訂單已取消')
            return res.redirect('back')
        } catch (e) {
            console.log(e)
        }
    },

    /*
       功能: 交易後回傳
       方法: POST
       參數: MerchantID, TradeInfo, TradeSha, Version
    */
    newebpayCallback: async (req, res) => {
        try {
            const data = JSON.parse(mpgData.decryptData(req.body.TradeInfo))
            // 訂單
            const order = await Order.findOne({ where: { sn: data.Result.MerchantOrderNo } })

            if (data.Status === 'SUCCESS') {
                // 建立 payment
                await Payment.create({
                    OrderId: order.id,
                    payment_method: data.Result.PaymentMethod ? data.Result.PaymentMethod : data.Result.PaymentType,
                    isSuccess: true,
                    failure_message: data.Message,
                    payTime: data.Result.PayTime
                })
                await order.update({
                    ...req.body,
                    payment_status: '1'
                })

                req.flash('success_msg', `訂單編號:${order.id} 付款成功!`)
            } else {
                req.flash('warning_msg', `訂單編號:${order.id} 付款失敗!  [說明] ${data.Message}`)
            }
            return res.redirect(`/order/${order.id}`)
        } catch (e) {
            console.log(e)
        }
    }
}

module.exports = ocppController
