import {Fragment, LegacyRef, type ReactNode, useEffect, useRef, useState} from 'react';
import {ipcRenderer} from "electron";
import {Config, Plugins, Rule} from '../../common/configTypes';
import React from 'react';
import {
    type FieldPath,
    type FieldArrayPath,
    FormProvider,
    useFieldArray,
    useForm,
    useFormContext,
    type FieldPathByValue,
    type FieldValues,
    type FieldArray, Controller, useWatch
} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {ErrorMessage} from "@hookform/error-message";
import {
    DropdownButton,
    Dropdown,
    Button,
    Badge,
    Toast,
    ToastContainer,
    ListGroup,
    ListGroupItem, Card, InputGroup, FormCheck, Row, Tab, Tabs, Collapse
} from "react-bootstrap";
import {DragDropContext, Droppable, Draggable, DropResult, ResponderProvided} from "react-beautiful-dnd";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBars, faCaretDown, faCross, faXmark} from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import FormCheckLabel from "react-bootstrap/FormCheckLabel";
import FormCheckInput from "react-bootstrap/FormCheckInput";

export default function Settings() {
    const [loadError, setLoadError] = useState('');
    const form = useForm({
        resolver: zodResolver(Config),
        shouldUnregister: true,
        defaultValues: async () => {
            try {
                return await Config.parseAsync(await ipcRenderer.invoke('config:get'));
            } catch(e) {
                setLoadError(e instanceof Error ? e.message : e+'');
                throw e;
            }
        }
    });
    const {
        reset,
        handleSubmit,
        formState: { errors, isValid, isDirty, isSubmitting, dirtyFields, isLoading }
    } = form;
    const onSubmit = handleSubmit(
        async data => {
            console.log("submit", data);
            await ipcRenderer.invoke('config:set', data);
            reset(data);
        }
    );

    if (loadError) return <>{loadError}</>;
    if (isLoading) return <>Loading configuration ...</>;

    return <FormProvider {...form}><form onSubmit={onSubmit} className="settings"><fieldset disabled={isSubmitting}>
        <Tabs className="mb-3">
            {MakePluginTab("intiface", "Intiface", <>
                <div>Intiface Server Port or IP:Port</div>
                <Field name="plugins.intiface.address" placeholder="12345" />
            </>)}
            {MakePluginTab("vrchat", "VRChat", <>
                <Field name="plugins.vrchat.allowSelfTouch" mode="check" checkLabel="Allow self hand > self socket/plug interaction"/>
                <Field name="plugins.vrchat.allowSelfPlug" mode="check" checkLabel="Allow self socket > self plug interaction"/>

                <FieldArray title="Forward VRChat's OSC Data to another application" name="plugins.vrchat.proxy" appendText="Add Proxy Port" flush={true} className="mt-4">{name =>
                    <Field name={`${name}.address`} placeholder="Example: 9002 or 192.168.0.5:9000" style={{border: 0}}/>
                }</FieldArray>

                <FieldArray title="Use custom avatar parameters as sources" name="plugins.vrchat.customSourceParams" appendText="Add Level Parameter" className="mt-4">{name =>
                    <>
                        <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                            <div style={{width:"150px", flexShrink:0}}>Parameter Name</div>
                            <Field name={`${name}.name`}/>
                        </div>
                        <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                            <div style={{width:"150px", flexShrink:0}}>Limit to Output Tags</div>
                            <Field name={`${name}.name`} placeholder="All"/>
                        </div>
                    </>
                }</FieldArray>

                <Advanced className="mt-3">
                    <Field name="plugins.vrchat.resetOscConfigs" mode="check" checkLabel="Automatically refresh OSC Configs"/>
                </Advanced>
            </>)}
            {MakePluginTab("idle", "Idle", <>
                <Field name="plugins.idle.level" mode="number" min="0" max="1"/>
            </>)}
            {MakePluginTab("rules", "Rules", <>
                <FieldArray title="Custom Interaction Rules" name="plugins.rules.rules" appendText="Add Rule" appendOptions={[
                    ["Multiply Intensity", {action: {type: "scale", scale: 1}}],
                    ["Vibrate based on movement", {action: {type: "movement"}}],
                ]}>
                    {name => <RuleEditor name={name}/>}
                </FieldArray>
            </>)}
        </Tabs>

        <ToastContainer position="bottom-center"><Toast style={{width:'auto'}} show={isDirty}>
            <Toast.Body>
                {Object.keys(errors).length > 0 && <div>There's an error in one of your selections</div>}
                You have unsaved changes <Button as="input" type="submit" variant="success" value="Save" />
            </Toast.Body>
        </Toast></ToastContainer>

    </fieldset></form></FormProvider>;
}

function MakePluginTab(pluginId: keyof Plugins, title: string, children: React.ReactNode) {
    return <Tab eventKey={pluginId} title={title}>
        <PluginToggle name={pluginId} label={`Enable ${title}`}>
            {children}
        </PluginToggle>
    </Tab>;
}

function PluginToggle({name, label, children}: {name: keyof Plugins, label: string, children: React.ReactNode}) {
    const {control, setValue} = useFormContext<Config>();
    const value = useWatch({control, name: `plugins.${name}`});
    const checked = name !== undefined;
    return <>
        <FormCheck
            id={`form_${name}`}
            checked={checked}
            onChange={e => {
                const newValue = undefined
                if (e.target.checked) newValue.push(name);
                setValue('enabledPlugins', newValue, { shouldDirty: true })
            }}
            label={label}
        />
        {checked && children}
    </>;
}

function RuleEditor({name}: {name: FieldPathByValue<Config, Rule>}) {
    const {control} = useFormContext<Config>();
    const type = useWatch({control, name:`${name}.action.type`});

    let body;
    if (type == "scale") {
        body = <div className="conditions">
            <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
                <div style={{flexShrink:0, paddingRight:5}}>Multiply intensity by</div>
                <Field style={{width:80}} name={`${name}.action.scale`} mode="number" type="number" step="any" min="0"/>
            </div>
        </div>;
    } else if (type == "movement") {
        body = <>Vibrate based on movement, rather than depth</>;
    }
    return <>
        <ConditionsEditor rulePath={name}/>
        {body}
    </>;
}

function ConditionsEditor({rulePath}: {rulePath: FieldPathByValue<Config, Rule>}) {
    const conditionPath: FieldPathByValue<Config, string> = `${rulePath}.condition`;
    const {setValue,getValues} = useFormContext<Config>();
    function addTag(tag: string) {
        let value = getValues(conditionPath);
        if (value == undefined) value = '';
        if (value != '' && !value.endsWith(' ') && !value.endsWith('-')) value += ' ';
        value += tag;
        setValue(conditionPath, value, { shouldDirty: true });
    }
    let conditions = <InputGroup>
        <Field name={conditionPath} placeholder="Always"/>
        <TagsDropdown onSelect={addTag}/>
    </InputGroup>;
    return <div className="conditions">
        <div style={{display:'flex', flexDirection:'row', alignItems:'center'}}>
            <div style={{flexShrink:0, paddingRight:5}}>When</div>
            {conditions}
        </div>
    </div>;
}

function TagsDropdown({onSelect}: {onSelect: (tag:string)=>void}) {
    const [loadedTags, setLoadedTags] = useState<string[]>();
    return <DropdownButton variant="outline-primary" title="Select Tag" style={{overflowY: 'auto', maxHeight: 400}} onToggle={async (nextShow) => {
        if (nextShow) {
            setLoadedTags(await ipcRenderer.invoke("tags:get"));
        } else {
            setLoadedTags(undefined);
        }
    }}>
        {loadedTags && loadedTags.map(tag =>
            <Dropdown.Item key={tag} onClick={_ => onSelect(tag)}>{tag}</Dropdown.Item>
        )}
    </DropdownButton>
}

function Field({name, placeholder, mode, checkLabel, ...rest}: {
    name: FieldPath<Config>,
    placeholder?: string,
    mode?: 'check' | 'number'
    checkLabel?: React.ReactNode
} & React.ComponentProps<"input">) {
    const {control, register, setValue, formState: { errors }} = useFormContext<Config>();
    const value = useWatch({control, name:name});
    let input;
    if (mode == 'check') {
        input = <FormCheck
            id={`form_${name}`}
            defaultChecked={!!value}
            onChange={e => {
                setValue(name, e.target.checked, { shouldDirty: true })
            }}
            label={checkLabel}
        />;
    } else if (mode == 'number') {
        input = <input {...register(name, { valueAsNumber: true })} placeholder={placeholder} className="form-control" type="number" step="any" {...rest} />;
    } else {
        input = <input {...register(name)} placeholder={placeholder} className="form-control" {...rest} />;
    }
    return <>
        {input}
        <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => <div className="error">{message}</div>}
        />
    </>;
}

function FieldArray<P extends FieldArrayPath<Config>>({name, title, flush, children, appendOptions, appendText, appendObject, emptyElement, allowReordering, className}: {
    name: P,
    title?: string,
    flush?: boolean,
    children: (path: `${P}.${number}`) => ReactNode,
    appendOptions?: [string,any][],
    appendText?: string,
    appendObject?: any,
    emptyElement?: ReactNode,
    allowReordering?: boolean,
    className?: string
}) {
    const {control} = useFormContext<Config>();
    const {
        fields,
        append,
        move,
        remove
    } = useFieldArray({
        control: control,
        name: name,
    });
    if (!appendText) appendText = "Add";

    let addButton;
    if (appendOptions) {
        addButton = <DropdownButton variant="outline-primary" title={appendText}>
            {appendOptions.map(([name,obj]) => <Dropdown.Item key={name} onClick={_ => append(obj)}>{name}</Dropdown.Item>)}
        </DropdownButton>
    } else {
        addButton = <Button variant="outline-primary" onClick={_ => append(appendObject ?? {})}>{appendText}</Button>
    }

    function onDragEnd(result: DropResult, provided: ResponderProvided) {
        console.log(result, provided);
        if (!result.destination) {
            return;
        }
        move(result.source.index, result.destination.index);
    }

    return <>
        <Card className={className}>
        <ListGroup variant="flush">
            {title && <ListGroup.Item className="title">{title}</ListGroup.Item>}
            {fields.length == 0 && emptyElement && <ListGroup.Item>{emptyElement}</ListGroup.Item>}
            <ListGroup.Item>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="droppable">
                    {(provided, snapshot) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                        >
                            {fields.map((field, index) =>
                                <Draggable key={field.id} draggableId={field.id} index={index}>
                                    {(provided, snapshot) => (
                                        <ListGroup.Item key={field.id} ref={provided.innerRef} {...provided.draggableProps}>
                                            <div className={classNames("main", {"flush": flush})}>
                                                <div className="handle" {...provided.dragHandleProps}>
                                                    <FontAwesomeIcon icon={faBars}/>
                                                </div>
                                                <div className="body">
                                                    {children(`${name}.${index}`)}
                                                </div>
                                                <FontAwesomeIcon icon={faXmark} className="remove" onClick={() => remove(index)}/>
                                            </div>
                                        </ListGroup.Item>
                                    )}
                                </Draggable>
                            )}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
            </ListGroup.Item>
            {addButton}
        </ListGroup>
        </Card>
    </>;

}

function Advanced({children, className}: {
    children: React.ReactElement,
    className?: string,
}) {
    const [open,setOpen] = useState(false);

    return <div className={className}>
        <a href="#" onClick={() => setOpen(!open)}>Advanced <FontAwesomeIcon icon={faCaretDown}/></a>
        <Collapse in={open}>
            <div>
                {children}
            </div>
        </Collapse>
    </div>
}
